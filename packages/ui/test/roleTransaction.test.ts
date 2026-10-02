import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { AgentRuntime } from "../../../apps/zcode-cli/packages/core/src/runtime/agent-runtime.js";
import { InMemorySessionEventStore } from "../../../apps/zcode-cli/packages/contracts/src/events/in-memory-session-event-store.js";
import { SqliteSessionStore } from "../../../apps/zcode-cli/packages/adapters/src/storage/session-store/sqlite-session-store.js";
import {
  flushPendingRoleBinding,
  restorePendingRoleBinding,
  restoreRoleBinding,
} from "../../../apps/zcode-cli/packages/core/src/runtime/role-binding.js";
import type { AgentRuntimeInternal } from "../../../apps/zcode-cli/packages/core/src/runtime/internal.js";
import type {
  SessionEntryInfo,
  SessionEvent,
} from "../../../apps/zcode-cli/packages/contracts/src/index.js";
import { ConversationV4Gateway } from "../../../apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/v4-gateway.js";

const role = {
  kind: "custom" as const,
  roleId: "04a923fa-2db3-4a85-b456-8ffa17ef86a1",
  name: "probe",
  identityPrompt: "probe identity",
  expressionStylePrompt: "probe style",
};

function rig() {
  const entries = new Map<string, SessionEntryInfo>();
  let failCommit = false;
  let failClear = false;
  const store = {
    async commitRoleBinding(input: { binding: SessionEntryInfo; pending: SessionEntryInfo }) {
      if (failCommit) throw new Error("commit failure");
      entries.set(input.binding.id, structuredClone(input.binding));
      entries.set(input.pending.id, structuredClone(input.pending));
    },
    async saveSessionEntry(entry: SessionEntryInfo) {
      if (failClear) throw new Error("clear failure");
      entries.set(entry.id, structuredClone(entry));
    },
    async sessionEntries(input: { type: string }) {
      return [...entries.values()].filter((entry) => entry.type === input.type);
    },
  };
  const eventStore = new InMemorySessionEventStore();
  const runtime = new AgentRuntime(
    "probe" as never,
    {
      workingDirectory: "/probe",
      memory: { enabled: false },
      envInfo: { cwd: "/probe", platform: "linux", shell: "bash", osVersion: "probe" },
    } as never,
    {
      eventStore,
      sessionStore: store,
      modelFactory: () => {
        throw new Error("No model needed");
      },
    } as never,
  );
  return {
    runtime,
    internal: runtime as unknown as AgentRuntimeInternal,
    entries,
    eventStore,
    store,
    failCommit: (value: boolean) => {
      failCommit = value;
    },
    failClear: (value: boolean) => {
      failClear = value;
    },
  };
}

test("role preparation and commit failures preserve accepted config, builder and history", async () => {
  const r = rig();
  const oldHistory = r.internal.messageHistory;
  const oldBuilder = r.internal.contextBuilder;
  r.failCommit(true);
  await assert.rejects(r.runtime.switchRoleBinding(role, {} as never), /commit failure/);
  assert.deepEqual(r.runtime.getRoleBinding(), { kind: "official" });
  assert.equal(r.internal.contextBuilder, oldBuilder);
  assert.equal(r.internal.messageHistory, oldHistory);
  assert.equal(r.entries.size, 0);
  r.failCommit(false);
  r.internal.contextBuilder = {} as never;
  r.internal.createContextBuilderFromSnapshot = () => {
    throw new Error("prepare failure");
  };
  await assert.rejects(r.runtime.switchRoleBinding(role, {} as never), /prepare failure/);
  assert.deepEqual(r.runtime.getRoleBinding(), { kind: "official" });
  assert.equal(r.entries.size, 0);
  assert.equal(r.internal.roleBindingMutationInProgress, false);
});

test("committed role survives append failure, blocks input and same-role retry repairs delivery", async () => {
  const r = rig();
  const append = r.eventStore.append.bind(r.eventStore);
  r.eventStore.append = async () => {
    throw new Error("append failure");
  };
  await r.runtime.switchRoleBinding(role, {} as never);
  assert.deepEqual(r.runtime.getRoleBinding(), role);
  assert.deepEqual(await restoreRoleBinding(r.store as never, "probe" as never), role);
  assert.ok(r.internal.pendingRoleBindingEvent);
  assert.equal((await r.runtime.admitPrompt("blocked")).kind, "rejected");
  r.eventStore.append = append;
  await r.runtime.switchRoleBinding(role, {} as never);
  assert.equal(r.internal.pendingRoleBindingEvent, undefined);
  assert.equal((await r.eventStore.getEvents("probe" as never)).length, 1);
});

test("sink and clear failures are retryable with one event ID and sequence", async () => {
  const r = rig();
  let fail = true;
  const received: SessionEvent[] = [];
  r.internal.eventSinks.add({
    onSessionEvent(event) {
      if (fail) throw new Error("sink failure");
      received.push(event);
    },
  });
  await r.runtime.switchRoleBinding(role, {} as never);
  assert.ok(r.internal.pendingRoleBindingEvent);
  fail = false;
  r.failClear(true);
  await assert.rejects(r.runtime.switchRoleBinding(role, {} as never), /still pending/);
  assert.equal((await r.eventStore.getEvents("probe" as never)).length, 1);
  r.failClear(false);
  await r.runtime.switchRoleBinding(role, {} as never);
  assert.equal(r.internal.pendingRoleBindingEvent, undefined);
  assert.ok(received.length >= 1);
  assert.equal(new Set(received.map((event) => event.sequenceNumber)).size, 1);
});

test("cold recovery restores committed binding and pending event on a fresh sequence", async () => {
  const first = rig();
  first.eventStore.append = async () => {
    throw new Error("exit before delivery");
  };
  await first.runtime.switchRoleBinding(role, {} as never);
  const restored = rig();
  restored.internal.sessionStore = first.store as never;
  restored.internal.config.roleBinding = await restoreRoleBinding(
    first.store as never,
    "probe" as never,
  );
  await restorePendingRoleBinding(restored.internal);
  assert.equal(restored.internal.pendingRoleBindingEvent?.sequenceNumber, 0);
  assert.equal(await flushPendingRoleBinding(restored.internal, {} as never), true);
  assert.deepEqual(restored.runtime.getRoleBinding(), role);
  assert.equal((await restored.eventStore.getEvents("probe" as never))[0]?.sequenceNumber, 1);
});

test("V4 failed role projection rehydrates, with desktop and remote subscriptions on the same owner", async () => {
  const r = rig();
  const gateway = new ConversationV4Gateway({
    sessionExists: () => true,
    emitWireFrame: () => {},
    executeCommand: async () => undefined,
    loadPersistedEvents: async () => ({
      events: await r.eventStore.getEvents("probe" as never),
      synthesized: false,
    }),
    getSessionConfigSeed: () => ({ roleBinding: r.runtime.getRoleBinding() }),
  } as never);
  try {
    await gateway.subscribe({
      topic: "conversation/probe",
      connectionId: "desktop",
      clientMode: "desktop-continuous",
    });
    await gateway.subscribe({
      topic: "conversation/probe",
      connectionId: "phone",
      clientMode: "web-remote-replayable",
    });
    const publishers = (
      gateway as unknown as {
        publishers: Map<
          string,
          {
            ingest: (event: SessionEvent) => void;
            getSnapshot: () => { config: { roleBinding: unknown }; seq: number };
          }
        >;
      }
    ).publishers;
    const publisher = publishers.get("probe")!;
    const ingest = publisher.ingest.bind(publisher);
    let failed = false;
    publisher.ingest = (event) => {
      if (!failed) {
        failed = true;
        throw new Error("projection failure");
      }
      ingest(event);
    };
    r.internal.eventSinks.add({
      onSessionEvent: (event) => gateway.ingestCommittedRoleBinding("probe", event),
    });
    await r.runtime.switchRoleBinding(role, {} as never);
    assert.equal(failed, true);
    assert.equal(r.internal.pendingRoleBindingEvent, undefined);
    assert.deepEqual(publishers.get("probe")!.getSnapshot().config.roleBinding, role);
    const seq = publishers.get("probe")!.getSnapshot().seq;
    await r.runtime.switchRoleBinding(role, {} as never);
    assert.equal(publishers.get("probe")!.getSnapshot().seq, seq);
    const reconnect = await gateway.subscribe({
      topic: "conversation/probe",
      connectionId: "phone",
      clientMode: "web-remote-replayable",
    });
    assert.ok(reconnect);
    assert.deepEqual(publishers.get("probe")!.getSnapshot().config.roleBinding, role);
  } finally {
    gateway.dispose();
  }
});

test("concurrent recovery coalesces and subsequent roles cannot overtake pending delivery", async () => {
  const r = rig();
  const append = r.eventStore.append.bind(r.eventStore);
  r.eventStore.append = async () => {
    throw new Error("append failure");
  };
  await r.runtime.switchRoleBinding(role, {} as never);
  await assert.rejects(
    r.runtime.switchRoleBinding({ kind: "official" }, {} as never),
    /still pending/,
  );
  assert.deepEqual(r.runtime.getRoleBinding(), role);
  r.eventStore.append = append;
  await Promise.all([
    flushPendingRoleBinding(r.internal, {} as never),
    flushPendingRoleBinding(r.internal, {} as never),
  ]);
  assert.equal((await r.eventStore.getEvents("probe" as never)).length, 1);
  await r.runtime.switchRoleBinding({ kind: "official" }, {} as never);
  const events = await r.eventStore.getEvents("probe" as never);
  assert.deepEqual(
    events.map((event) => (event.payload as { roleBinding: unknown }).roleBinding),
    [role, { kind: "official" }],
  );
});

test("input admission cannot race a delayed role commit", async () => {
  const r = rig();
  const commit = r.store.commitRoleBinding;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  r.store.commitRoleBinding = async (input) => {
    entered();
    await gate;
    await commit(input);
  };
  const switching = r.runtime.switchRoleBinding(role, {} as never);
  await started;
  assert.equal((await r.runtime.admitPrompt("during commit")).kind, "rejected");
  assert.deepEqual(r.runtime.getRoleBinding(), { kind: "official" });
  await assert.rejects(
    r.runtime.switchRoleBinding({ kind: "official" }, {} as never),
    /active or queued/,
  );
  release();
  await switching;
  assert.equal(r.internal.roleBindingMutationInProgress, false);
  assert.deepEqual(r.runtime.getRoleBinding(), role);
});

test("SQLite role commit rolls back the binding when pending-event insertion fails", async () => {
  const store = new SqliteSessionStore({ dbPath: ":memory:" });
  try {
    await store.createSession({
      id: "probe" as never,
      projectID: "probe" as never,
      slug: "probe",
      directory: "/probe",
      title: "probe",
      version: "test",
    });
    const db = (store as unknown as { db: DatabaseSync }).db;
    const entry = (id: string, type: string, data: unknown): SessionEntryInfo => ({
      id,
      sessionID: "probe" as never,
      type,
      touchSession: false,
      time: { created: 1, updated: 1 },
      data,
    });
    await store.saveSessionEntry(entry("binding", "runtime/role_binding", { kind: "official" }));
    db.exec(
      "CREATE TRIGGER reject_pending BEFORE INSERT ON session_entry WHEN NEW.type = 'runtime/role_binding_pending' BEGIN SELECT RAISE(ABORT, 'pending failure'); END",
    );
    await assert.rejects(
      store.commitRoleBinding({
        binding: entry("binding", "runtime/role_binding", role),
        pending: entry("pending", "runtime/role_binding_pending", {}),
      }),
      /pending failure/,
    );
    assert.deepEqual(
      (await store.sessionEntries({ sessionID: "probe" as never, type: "runtime/role_binding" }))[0]
        ?.data,
      { kind: "official" },
    );
    db.exec("DROP TRIGGER reject_pending");
    await store.commitRoleBinding({
      binding: entry("binding", "runtime/role_binding", role),
      pending: entry("pending", "runtime/role_binding_pending", {}),
    });
    assert.equal((await store.sessionEntries({ sessionID: "probe" as never })).length, 2);
  } finally {
    store.close();
  }
});

test("the next real runtime model request uses the committed role and retains conversation history", async () => {
  const store = new SqliteSessionStore({ dbPath: ":memory:" });
  const requests: string[] = [];
  const model = {
    providerId: "test",
    modelId: "test",
    properties: {
      contextWindow: 131072,
      maxOutputTokens: 2048,
      inputFormat: { text: true },
      outputFormat: { text: true },
      supportsTools: true,
    },
    optionSpecs: { maxOutputTokens: { max: 2048, min: 1, default: 2048 } },
    options: {},
    bind() {
      return this;
    },
    async generateText(request: { messages: unknown }) {
      requests.push(JSON.stringify(request.messages));
      return {
        text: "probe reply",
        toolCalls: [],
        finishReason: "stop",
        usage: { inputTokens: 10, outputTokens: 5 },
      };
    },
  };
  const runtime = new AgentRuntime(
    "probe" as never,
    {
      workingDirectory: "/probe",
      memory: { enabled: false },
      modelStreaming: "off",
      modelSelection: { providerId: "test", modelId: "test" },
      envInfo: { cwd: "/probe", platform: "linux", shell: "bash", osVersion: "probe" },
    } as never,
    {
      eventStore: new InMemorySessionEventStore(),
      sessionStore: store,
      modelFactory: () => model,
    } as never,
  );
  try {
    await runtime.executeTurn("first input");
    await runtime.switchRoleBinding(role, {} as never);
    await runtime.executeTurn("second input");
    assert.equal(requests.length, 2);
    assert.ok(!requests[0]!.includes(role.identityPrompt));
    assert.ok(requests[1]!.includes(role.identityPrompt));
    assert.ok(requests[1]!.includes("first input"));
    assert.ok(requests[1]!.includes("probe reply"));
  } finally {
    await runtime.closeBrowserSession();
    store.close();
  }
});
