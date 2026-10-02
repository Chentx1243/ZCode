import { V4CommandExecutor } from "../../../apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/executor.js";
import { AgentRuntime } from "../../../apps/zcode-cli/packages/core/src/runtime/agent-runtime.js";
import { createInMemorySessionEventStore } from "../../../apps/zcode-cli/packages/contracts/src/events/in-memory-session-event-store.js";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ContextBuilder } from "../../../apps/zcode-cli/packages/core/src/context/builder.js";
import {
  bindInitialRole,
  getRoleBinding,
  buildRoleBindingEntry,
  restoreRoleBinding,
} from "../../../apps/zcode-cli/packages/core/src/runtime/role-binding.js";
import { roleBindingSchema } from "../../shared/src/role-binding.js";
import { parseCommandEnvelope } from "../../shared/src/zcode-protocol-v4/command.js";
import { createRoleManagementStore } from "../src/store/roleManagementStore.js";
import { listRolePresets } from "../src/lib/rolePresets.js";

const role = {
  kind: "custom" as const,
  roleId: "04a923fa-2db3-4a85-b456-8ffa17ef86a1",
  name: "测试人物",
  identityPrompt: "你是一位海边的写作伙伴。",
  expressionStylePrompt: "用温和自然的语言，多举生活中的例子。",
};
const envInfo = { cwd: "/role-test", platform: "linux", shell: "bash", osVersion: "test" };
const config = {
  workingDirectory: "/role-test",
  envInfo,
  currentDate: "2026-09-30",
  memoryRoot: "/role-memory",
  guidanceToolNames: [],
};
const baseline = JSON.parse(
  readFileSync(new URL("./role-official-baseline.json", import.meta.url), "utf8"),
);

test("official restores byte-identical default messages and sections on both presentation surfaces", () => {
  for (const presentationSurface of ["terminal", "zcode_desktop"] as const) {
    const builder = new ContextBuilder({ ...config, presentationSurface });
    assert.deepEqual(builder.build(), baseline[presentationSurface]);
    assert.deepEqual(
      new ContextBuilder({
        ...config,
        presentationSurface,
        roleBinding: { kind: "official" },
      }).build(),
      baseline[presentationSurface],
    );
    new ContextBuilder({ ...config, presentationSurface, roleBinding: role }).build();
    assert.deepEqual(builder.build(), baseline[presentationSurface]);
  }
});

test("custom identity/style replace only presentation, retaining operational contracts", () => {
  const original = new ContextBuilder({ ...config, presentationSurface: "zcode_desktop" }).build();
  const custom = new ContextBuilder({
    ...config,
    presentationSurface: "zcode_desktop",
    roleBinding: role,
  }).build();
  const text = custom.systemMessages.map((m) => JSON.stringify(m)).join("\n");
  assert.ok(text.includes(role.identityPrompt));
  assert.ok(text.includes(role.expressionStylePrompt));
  assert.ok(!text.includes("an interactive coding agent"));
  assert.ok(!text.includes("helps users with software engineering tasks"));
  assert.ok(!text.includes("Lead with the outcome."));
  for (const section of original.sections.filter(
    (s) => !["identity", "cli_prefix", "dynamic_behavior"].includes(s.source),
  )) {
    assert.deepEqual(
      custom.sections.find((s) => s.source === section.source),
      section,
    );
  }
  for (const required of [
    "# Harness",
    "Tools run behind a user-selected permission mode",
    "IMPORTANT: Assist with authorized security testing",
    "Everything the user needs from this turn",
    "Report outcomes faithfully",
    "Write code that reads like the surrounding code",
  ])
    assert.ok(text.includes(required), required);
  assert.deepEqual(custom.metaUserAttachments, original.metaUserAttachments);
  assert.equal(custom.sections.filter((s) => s.source === "output_style").length, 0);
});

test("strict official payload cannot carry substituted text; invalid/conflicting roles reject", () => {
  assert.equal(
    roleBindingSchema.safeParse({ kind: "official", identityPrompt: "override" }).success,
    false,
  );
  assert.equal(roleBindingSchema.safeParse({ ...role, expressionStylePrompt: " " }).success, false);
  assert.throws(
    () => new ContextBuilder({ ...config, roleBinding: role, customSystemPrompt: "other" }).build(),
    /conflicts/,
  );
  const result = parseCommandEnvelope({
    commandId: "test",
    clientId: "test",
    sessionId: null,
    type: "createSession",
    payload: { workspaceId: "/role-test", config: { roleBinding: role } },
    issuedAt: 0,
  });
  assert.equal(result.ok, true);
});

test("initial binding is immutable, isolated and refuses already-started sessions", () => {
  const runtime = {
    config: {},
    sessionPersisted: false,
    turnNumber: 0,
    hasActiveOrQueuedTurnWork: () => false,
    contextInitialized: false,
    contextBuilder: null,
    messageHistory: { borrowReadOnlyRuntimeEntries: () => [] },
  };
  bindInitialRole.call(runtime as never, role);
  const snapshot = getRoleBinding.call(runtime as never);
  const edited = { ...role, identityPrompt: "edited later" };
  assert.equal(snapshot.kind === "custom" && snapshot.identityPrompt, role.identityPrompt);
  assert.notDeepEqual(snapshot, edited);
  assert.equal(Object.isFrozen((runtime.config as { roleBinding: unknown }).roleBinding), true);
  const entry = buildRoleBindingEntry("session-test" as never, snapshot);
  assert.deepEqual(roleBindingSchema.parse(entry.data), role);
  runtime.sessionPersisted = true;
  assert.throws(() => bindInitialRole.call(runtime as never, { kind: "official" }), /new, idle/);
  const other = { ...runtime, config: {} };
  assert.deepEqual(getRoleBinding.call(other as never), { kind: "official" });
});

test("global default persistence, failure, official recovery and editing preserve session snapshots", () => {
  const data = new Map<string, string>();
  let fail = false;
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (fail) throw new Error("quota");
      data.set(k, v);
    },
  };
  const store = createRoleManagementStore(() => storage);
  store.getState().hydrate();
  assert.equal(store.getState().selectedRoleId, "zcode-official");
  assert.equal(store.getState().setDefaultRole("04a923fa-2db3-4a85-b456-8ffa17ef86a1").ok, true);
  const snapshot = { ...listRolePresets(store.getState().overrides, "zh-CN")[1]! };
  assert.equal(
    store.getState().updateRole(snapshot.id, { ...snapshot, identityPrompt: "new definition" }).ok,
    true,
  );
  assert.notEqual(snapshot.identityPrompt, store.getState().overrides[snapshot.id]!.identityPrompt);
  const restored = createRoleManagementStore(() => storage);
  restored.getState().hydrate();
  assert.equal(restored.getState().selectedRoleId, "04a923fa-2db3-4a85-b456-8ffa17ef86a1");
  fail = true;
  assert.equal(store.getState().setDefaultRole("zcode-official").error, "storage");
  assert.equal(store.getState().selectedRoleId, "04a923fa-2db3-4a85-b456-8ffa17ef86a1");
  fail = false;
  assert.equal(store.getState().setDefaultRole("zcode-official").ok, true);
  assert.equal(store.getState().selectedRoleId, "zcode-official");
  assert.equal(store.getState().setDefaultRole("missing").error, "not-found");
});

test("cold binding restore uses original content, isolates sessions and rejects corrupt snapshots", async () => {
  const entry = buildRoleBindingEntry("saved" as never, role);
  const store = {
    sessionEntries: async ({ sessionID }: { sessionID: string }) =>
      sessionID === "saved" ? [entry] : [],
  };
  assert.deepEqual(await restoreRoleBinding(store as never, "saved" as never), role);
  assert.deepEqual(await restoreRoleBinding(store as never, "old-session" as never), {
    kind: "official",
  });
  await assert.rejects(
    restoreRoleBinding(
      { sessionEntries: async () => [{ ...entry, data: { kind: "custom" } }] } as never,
      "saved" as never,
    ),
  );
});

test("actual runtime provider requests use session role and preserve the official tool surface", async () => {
  const captured: { messages: unknown; tools: unknown }[] = [];
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
    async generateText(request: { messages: unknown; tools: unknown }) {
      captured.push(request);
      return {
        text: "测试完成",
        toolCalls: [],
        finishReason: "stop",
        usage: { inputTokens: 10, outputTokens: 5 },
      };
    },
    streamText(): AsyncIterable<never> {
      throw new Error("unexpected streaming");
    },
  };
  const advancedRole = {
    ...role,
    promptOverrides: {
      codeStyle: "Advanced provider code style",
      harness: "Advanced provider harness",
    },
  };
  for (const binding of [advancedRole, { kind: "official" as const }]) {
    const runtime = new AgentRuntime(
      `role-${binding.kind}` as never,
      {
        modelSelection: { providerId: "test", modelId: "test" },
        modelStreaming: "off",
        workingDirectory: "/role-test",
        envInfo,
        memory: { enabled: false },
      } as never,
      { modelFactory: () => model, eventStore: createInMemorySessionEventStore() } as never,
    );
    try {
      runtime.bindInitialRole(binding);
      await runtime.executeTurn("测试输入");
    } finally {
      await runtime.closeBrowserSession();
    }
  }
  assert.equal(captured.length, 2);
  assert.ok(JSON.stringify(captured[0]!.messages).includes("Advanced provider code style"));
  assert.ok(JSON.stringify(captured[0]!.messages).includes("Advanced provider harness"));
  assert.ok(
    !JSON.stringify(captured[0]!.messages).includes(
      "Write code that reads like the surrounding code",
    ),
  );
  assert.ok(!JSON.stringify(captured[1]!.messages).includes("Advanced provider harness"));
  assert.ok(JSON.stringify(captured[0]!.messages).includes(role.identityPrompt));
  assert.ok(JSON.stringify(captured[0]!.messages).includes(role.expressionStylePrompt));
  assert.ok(!JSON.stringify(captured[1]!.messages).includes(role.identityPrompt));
  assert.deepEqual(captured[0]!.tools, captured[1]!.tools);
});

test("role temperature reaches the provider request only for configured custom roles", async () => {
  const captured: { options?: { temperature?: number } }[] = [];
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
    async generateText(request: { options?: { temperature?: number } }) {
      captured.push(request);
      return {
        text: "测试完成",
        toolCalls: [],
        finishReason: "stop",
        usage: { inputTokens: 10, outputTokens: 5 },
      };
    },
    streamText(): AsyncIterable<never> {
      throw new Error("unexpected streaming");
    },
  };
  const warmRole = { ...role, temperature: 0.8 };
  for (const binding of [warmRole, role, { kind: "official" as const }]) {
    const runtime = new AgentRuntime(
      `role-temperature-${captured.length}` as never,
      {
        modelSelection: { providerId: "test", modelId: "test" },
        modelStreaming: "off",
        workingDirectory: "/role-test",
        envInfo,
        memory: { enabled: false },
      } as never,
      { modelFactory: () => model, eventStore: createInMemorySessionEventStore() } as never,
    );
    try {
      runtime.bindInitialRole(binding);
      await runtime.executeTurn("测试输入");
    } finally {
      await runtime.closeBrowserSession();
    }
  }
  assert.equal(captured.length, 3);
  assert.equal(captured[0]!.options?.temperature, 0.8);
  // 未配置温度的 custom 角色与 official 角色都不带该字段，维持服务端默认。
  assert.ok(!("temperature" in (captured[1]!.options ?? {})));
  assert.ok(!("temperature" in (captured[2]!.options ?? {})));
});

test("V4 creation installs the requested role before the create acknowledgement", async () => {
  let bound: unknown;
  const record = {
    app: {
      runtime: {
        bindInitialRole: (binding: unknown) => {
          bound = binding;
        },
        getSessionModelSelection: () => undefined,
      },
      getThoughtLevel: () => undefined,
      getMode: () => "build",
    },
    traceContext: {},
  };
  const host = {
    createSessionRecord: async () => ({ sessionId: "created" }),
    getRecord: () => record,
  };
  const result = await new V4CommandExecutor(host as never).execute({
    type: "createSession",
    sessionId: null,
    commandId: "create-test",
    payload: { workspaceId: "/role-test", config: { roleBinding: role } },
  } as never);
  assert.deepEqual(bound, role);
  assert.deepEqual(result, { type: "createSession", sessionId: "created" });
});

test("V4 creation closes the deferred record when initial role binding fails", async () => {
  const closed: string[] = [];
  let firstInputStarted = false;
  const host = {
    createSessionRecord: async () => ({ sessionId: "invalid-role" }),
    closeSession: async (id: string) => {
      closed.push(id);
    },
    getRecord: () => ({
      app: {
        runtime: {
          bindInitialRole: () => {
            throw new Error("invalid binding");
          },
          executeTurn: () => {
            firstInputStarted = true;
          },
        },
      },
    }),
  };
  await assert.rejects(
    new V4CommandExecutor(host as never).execute({
      type: "createSession",
      sessionId: null,
      commandId: "bad-role",
      payload: {
        workspaceId: "/role-test",
        config: { roleBinding: role },
        firstInput: { text: "hello" },
      },
    } as never),
    /invalid binding/,
  );
  assert.deepEqual(closed, ["invalid-role"]);
  assert.equal(firstInputStarted, false);
});

test("V4 creation validates malformed role bindings before allocating a record", async () => {
  let allocated = false;
  const host = {
    createSessionRecord: async () => {
      allocated = true;
      return { sessionId: "bad" };
    },
  };
  await assert.rejects(
    new V4CommandExecutor(host as never).execute({
      type: "createSession",
      sessionId: null,
      commandId: "bad-shape",
      payload: { workspaceId: "/role-test", config: { roleBinding: { kind: "custom" } } },
    } as never),
  );
  assert.equal(allocated, false);
});
