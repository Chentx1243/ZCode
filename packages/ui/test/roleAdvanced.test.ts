import assert from "node:assert/strict";
import test from "node:test";
import {
  ROLE_PROMPT_SECTIONS,
  rolePromptOverridesSchema,
} from "../../shared/src/role-prompt-sections.js";
import { roleBindingSchema } from "../../shared/src/role-binding.js";
import { ContextBuilder } from "../../../apps/zcode-cli/packages/core/src/context/builder.js";
import {
  bindInitialRole,
  getRoleBinding,
  buildRoleBindingEntry,
  restoreRoleBinding,
  switchRoleBinding,
} from "../../../apps/zcode-cli/packages/core/src/runtime/role-binding.js";
import {
  createRoleManagementStore,
  ROLE_PRESETS_STORAGE_KEY,
} from "../src/store/roleManagementStore.js";

const role = {
  kind: "custom" as const,
  roleId: "04a923fa-2db3-4a85-b456-8ffa17ef86a1",
  name: "Test",
  identityPrompt: "Test identity",
  expressionStylePrompt: "Test style",
};
const fields = {
  name: "Test",
  author: "Local",
  description: "",
  identityPrompt: "Test identity",
  expressionStylePrompt: "Test style",
};
const config = {
  workingDirectory: "/test",
  envInfo: { cwd: "/test", platform: "linux", shell: "bash", osVersion: "test" },
  presentationSurface: "zcode_desktop" as const,
  memoryRoot: "/memory",
  guidanceToolNames: ["Skill"],
  skills: {
    skills: [{ name: "test", description: "Test skill", path: "/skills/test/SKILL.md" }],
  } as never,
  userInstructions: {
    filePath: "/test/AGENTS.md",
    fileName: "AGENTS.md",
    content: "Project rule body",
    bytesRead: 17,
    sizeBytes: 17,
    truncated: false,
  },
};

test("all advanced overrides replace their own default fragment in the actual context", () => {
  const defaults = new ContextBuilder({ ...config, roleBinding: role }).build();
  const original = defaults.sections.map((s) => s.content).join("\n");
  for (const [id, section] of Object.entries(ROLE_PROMPT_SECTIONS)) {
    assert.ok(original.includes(section.prompt), `default ${id} is in main context`);
    const marker = `Advanced replacement ${id}`;
    const modified = new ContextBuilder({
      ...config,
      roleBinding: { ...role, promptOverrides: { [id]: marker } },
    }).build();
    const text = modified.sections.map((s) => s.content).join("\n");
    assert.ok(text.includes(marker), id);
    assert.ok(!text.includes(section.prompt), `original ${id} removed`);
    assert.ok(text.includes("/memory/"));
    assert.ok(text.includes("Project rule body"));
    assert.ok(text.includes("/skills/test/SKILL.md"));
    for (const [otherId, other] of Object.entries(ROLE_PROMPT_SECTIONS)) {
      if (otherId !== id)
        assert.ok(text.includes(other.prompt), `keeps ${otherId} when changing ${id}`);
    }
  }
});

test("conditional advanced sections do not create unavailable desktop, memory or skill capabilities", () => {
  const result = new ContextBuilder({
    ...config,
    presentationSurface: "terminal",
    memoryRoot: undefined,
    skills: undefined,
    userInstructions: undefined,
    guidanceToolNames: [],
    roleBinding: {
      ...role,
      promptOverrides: {
        desktop: "Desktop marker",
        memory: "Memory marker",
        skillGuidance: "Skill marker",
        projectInstructions: "Project marker",
      },
    },
  }).build();
  const text = JSON.stringify(result);
  for (const marker of ["Desktop marker", "Memory marker", "Skill marker", "Project marker"])
    assert.ok(!text.includes(marker));
});

test("advanced schema rejects unknown or blank fields and all official overrides", () => {
  for (const value of [{ nope: "text" }, { harness: " " }, { harness: 2 }, null, []])
    assert.equal(rolePromptOverridesSchema.safeParse(value).success, false);
  assert.equal(
    roleBindingSchema.safeParse({ kind: "official", promptOverrides: { harness: "text" } }).success,
    false,
  );
  assert.equal(roleBindingSchema.safeParse(role).success, true);
  assert.equal(roleBindingSchema.safeParse({ ...role, roleId: "zcode-official" }).success, false);
});

test("advanced snapshots are deeply isolated, frozen and survive cold restore", async () => {
  const input = { ...role, promptOverrides: { codeStyle: "custom code style" } };
  const runtime = {
    config: {},
    sessionPersisted: false,
    turnNumber: 0,
    hasActiveOrQueuedTurnWork: () => false,
    contextInitialized: false,
    contextBuilder: null,
    messageHistory: { borrowReadOnlyRuntimeEntries: () => [] },
  };
  bindInitialRole.call(runtime as never, input);
  input.promptOverrides.codeStyle = "changed later";
  const snapshot = getRoleBinding.call(runtime as never);
  assert.ok(snapshot.kind === "custom");
  assert.equal(snapshot.promptOverrides?.codeStyle, "custom code style");
  assert.ok(Object.isFrozen(snapshot.promptOverrides));
  const restored = await restoreRoleBinding(
    { sessionEntries: async () => [buildRoleBindingEntry("s" as never, snapshot)] } as never,
    "s" as never,
  );
  assert.deepEqual(restored, snapshot);
  assert.ok(restored.kind === "custom" && Object.isFrozen(restored.promptOverrides));
});

test("v2 migration retains fields, IDs, order, selection and backup; v3 restores sparse overrides", () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
  const legacy = JSON.stringify({
    version: 2,
    selectedRoleId: "04a923fa-2db3-4a85-b456-8ffa17ef86a1",
    overrides: { "04a923fa-2db3-4a85-b456-8ffa17ef86a1": fields },
  });
  storage.setItem("zcode-role-presets-v2", legacy);
  const store = createRoleManagementStore(() => storage);
  store.getState().hydrate();
  assert.equal(store.getState().selectedRoleId, "04a923fa-2db3-4a85-b456-8ffa17ef86a1");
  assert.deepEqual(store.getState().overrides["04a923fa-2db3-4a85-b456-8ffa17ef86a1"], fields);
  assert.equal(storage.getItem("zcode-role-presets-v2"), legacy);
  assert.equal(JSON.parse(storage.getItem(ROLE_PRESETS_STORAGE_KEY)!).version, 3);
  assert.equal(
    store.getState().updateRole("04a923fa-2db3-4a85-b456-8ffa17ef86a1", {
      ...fields,
      promptOverrides: { harness: "new harness" },
    }).ok,
    true,
  );
  const restored = createRoleManagementStore(() => storage);
  restored.getState().hydrate();
  assert.deepEqual(
    restored.getState().overrides["04a923fa-2db3-4a85-b456-8ffa17ef86a1"]?.promptOverrides,
    {
      harness: "new harness",
    },
  );
  assert.equal(
    restored.getState().updateRole("04a923fa-2db3-4a85-b456-8ffa17ef86a1", {
      ...fields,
      promptOverrides: { harness: " " },
    }).ok,
    false,
  );
  assert.equal(
    restored
      .getState()
      .updateRole("zcode-official", { ...fields, promptOverrides: { harness: "hack" } }).error,
    "readonly",
  );
});

test("failed v2 migration keeps legacy storage and blocks saves without publishing empty success", () => {
  const legacy = JSON.stringify({
    version: 2,
    overrides: { "04a923fa-2db3-4a85-b456-8ffa17ef86a1": fields },
  });
  const store = createRoleManagementStore(() => ({
    getItem: (key) => (key === "zcode-role-presets-v2" ? legacy : null),
    setItem: () => {
      throw new Error("quota");
    },
  }));
  store.getState().hydrate();
  assert.equal(store.getState().loadError, "storage");
  assert.equal(
    store.getState().updateRole("04a923fa-2db3-4a85-b456-8ffa17ef86a1", fields).error,
    "storage",
  );
});

test("advanced session switching is idle-only, atomic on storage failure and idempotent", async () => {
  let busy = false;
  let fail = true;
  const entries: unknown[] = [];
  const events: unknown[] = [];
  const runtime = {
    sessionId: "session",
    config: { roleBinding: roleBindingSchema.parse({ kind: "official" }) },
    contextInitialized: false,
    contextBuilder: null,
    messageHistory: { borrowReadOnlyRuntimeEntries: () => [] },
    roleBindingMutationInProgress: false,
    hasActiveOrQueuedTurnWork: () => busy,
    sessionStore: {
      saveSessionEntry: async (entry: unknown) => {
        if (fail) throw new Error("quota");
        entries.push(entry);
      },
    },
    getRoleBinding: () => getRoleBinding.call(runtime as never),
    createEvent: (_type: unknown, payload: unknown) => payload,
    appendEvent: async (event: unknown) => {
      events.push(event);
    },
  };
  const binding = { ...role, promptOverrides: { finalReply: "Custom final delivery" } };
  await assert.rejects(switchRoleBinding.call(runtime as never, binding, {} as never), /quota/);
  assert.deepEqual(runtime.config.roleBinding, { kind: "official" });
  assert.equal(runtime.roleBindingMutationInProgress, false);
  fail = false;
  busy = true;
  await assert.rejects(
    switchRoleBinding.call(runtime as never, binding, {} as never),
    /active or queued/,
  );
  busy = false;
  await switchRoleBinding.call(runtime as never, binding, {} as never);
  assert.deepEqual(runtime.config.roleBinding, binding);
  assert.equal(entries.length, 1);
  assert.equal(events.length, 1);
  await switchRoleBinding.call(runtime as never, binding, {} as never);
  assert.equal(entries.length, 1);
  await switchRoleBinding.call(runtime as never, { kind: "official" }, {} as never);
  assert.deepEqual(runtime.config.roleBinding, { kind: "official" });
});
