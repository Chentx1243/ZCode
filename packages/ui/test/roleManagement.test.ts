import assert from "node:assert/strict";
import test from "node:test";
import {
  createRoleManagementStore,
  ROLE_PRESETS_STORAGE_KEY,
  LEGACY_ROLE_PRESETS_STORAGE_KEY,
} from "../src/store/roleManagementStore.js";
import {
  listRolePresets,
  rolePresetToBinding,
  type RolePresetFields,
} from "../src/lib/rolePresets.js";
import {
  createTaskNavigationHistory,
  pushNavEntry,
  pushPluginStoreNavEntry,
  pushRoleManagementNavEntry,
  goBack,
  goForward,
  removeTaskFromHistory,
} from "../src/lib/taskNavigationHistory.js";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

const edited: RolePresetFields = {
  name: "我的助手",
  author: "本地作者",
  description: "简洁、直接",
  identityPrompt: "先理解需求，再清晰回答。",
  expressionStylePrompt: "温和直接。",
};

test("shipped DexCode exists without local data and carries its advanced prompts", () => {
  for (const locale of ["zh-CN", "en-US"]) {
    const roles = listRolePresets({}, locale);
    assert.equal(roles.length, 2);
    const dex = roles[1]!;
    assert.equal(dex.name, "DexCode");
    assert.match(dex.identityPrompt, /You are DexCode/);
    assert.deepEqual(Object.keys(dex.promptOverrides!).sort(), [
      "desktop",
      "finalReply",
      "progress",
      "projectInstructions",
    ]);
    const binding = rolePresetToBinding(dex);
    assert.equal(binding.kind, "custom");
    assert.ok(binding.kind === "custom");
    assert.equal(binding.identityPrompt, dex.identityPrompt);
    assert.equal(binding.expressionStylePrompt, dex.expressionStylePrompt);
    assert.deepEqual(binding.promptOverrides, dex.promptOverrides);
    assert.ok(Object.isFrozen(binding));
    assert.ok(Object.isFrozen(binding.promptOverrides));
  }
});

test("retired example defaults fall back without losing other local roles or rewriting storage", () => {
  for (const selectedRoleId of ["general-assistant", "writing-partner"]) {
    const storage = memoryStorage();
    const customId = "12a923fa-2db3-4a85-b456-8ffa17ef86a1";
    const raw = JSON.stringify({
      version: 3,
      selectedRoleId,
      overrides: {
        [selectedRoleId]: edited,
        [customId]: edited,
        "04a923fa-2db3-4a85-b456-8ffa17ef86a1": { ...edited, name: "My DexCode" },
      },
    });
    storage.setItem(ROLE_PRESETS_STORAGE_KEY, raw);
    const store = createRoleManagementStore(() => storage);
    store.getState().hydrate();
    assert.equal(store.getState().loadError, null);
    assert.equal(store.getState().selectedRoleId, "zcode-official");
    const roles = listRolePresets(store.getState().overrides, "zh-CN");
    assert.deepEqual(
      roles.map((r) => r.id),
      ["zcode-official", "04a923fa-2db3-4a85-b456-8ffa17ef86a1", customId],
    );
    assert.equal(roles[1]!.name, "My DexCode");
    assert.deepEqual(store.getState().overrides[customId], edited);
    assert.equal(storage.getItem(ROLE_PRESETS_STORAGE_KEY), raw);
  }
});

test("official is first and immutable even through the update interface", () => {
  const storage = memoryStorage();
  const store = createRoleManagementStore(() => storage);
  store.getState().hydrate();
  const roles = listRolePresets(store.getState().overrides, "zh-CN");
  assert.deepEqual(
    roles.map((role) => role.id),
    ["zcode-official", "04a923fa-2db3-4a85-b456-8ffa17ef86a1"],
  );
  assert.equal(roles[0]?.builtin, true);
  assert.equal(store.getState().updateRole("zcode-official", edited).error, "readonly");
  assert.equal(storage.data.size, 0);
  assert.equal(listRolePresets(store.getState().overrides, "zh-CN")[0]?.name, "ZCode 官方");
});

test("saved fields survive a new client store and keep user text across languages", () => {
  const storage = memoryStorage();
  const store = createRoleManagementStore(() => storage);
  store.getState().hydrate();
  assert.equal(
    store.getState().updateRole("04a923fa-2db3-4a85-b456-8ffa17ef86a1", edited).ok,
    true,
  );
  const restored = createRoleManagementStore(() => storage);
  restored.getState().hydrate();
  assert.deepEqual(listRolePresets(restored.getState().overrides, "en-US")[1], {
    id: "04a923fa-2db3-4a85-b456-8ffa17ef86a1",
    builtin: false,
    ...edited,
  });
  assert.equal(listRolePresets(restored.getState().overrides, "en-US")[0]?.name, "ZCode Official");
});

test("blank required fields and unknown IDs cannot publish or persist changes", () => {
  const storage = memoryStorage();
  const store = createRoleManagementStore(() => storage);
  store.getState().hydrate();
  for (const fields of [
    { ...edited, name: "  " },
    { ...edited, identityPrompt: "\n " },
  ]) {
    assert.equal(
      store.getState().updateRole("04a923fa-2db3-4a85-b456-8ffa17ef86a1", fields).error,
      "required",
    );
  }
  assert.equal(store.getState().updateRole("missing", edited).error, "not-found");
  assert.deepEqual(store.getState().overrides, {});
  assert.equal(storage.data.size, 0);
});

test("failed persistence never publishes unsaved fields and a retry can succeed", () => {
  const storage = memoryStorage();
  let fail = true;
  const store = createRoleManagementStore(() => ({
    getItem: storage.getItem,
    setItem: (key, value) => {
      if (fail) throw new Error("quota");
      storage.setItem(key, value);
    },
  }));
  store.getState().hydrate();
  assert.equal(
    store.getState().updateRole("04a923fa-2db3-4a85-b456-8ffa17ef86a1", edited).error,
    "storage",
  );
  assert.deepEqual(store.getState().overrides, {});
  fail = false;
  assert.equal(
    store.getState().updateRole("04a923fa-2db3-4a85-b456-8ffa17ef86a1", edited).ok,
    true,
  );
  assert.deepEqual(store.getState().overrides["04a923fa-2db3-4a85-b456-8ffa17ef86a1"], edited);
});

test("stored official or unknown overrides cannot become built-in or extra roles", () => {
  const storage = memoryStorage();
  storage.setItem(
    ROLE_PRESETS_STORAGE_KEY,
    JSON.stringify({
      version: 3,
      overrides: {
        "zcode-official": edited,
        unknown: edited,
        "04a923fa-2db3-4a85-b456-8ffa17ef86a1": edited,
      },
    }),
  );
  const store = createRoleManagementStore(() => storage);
  store.getState().hydrate();
  assert.deepEqual(Object.keys(store.getState().overrides), [
    "04a923fa-2db3-4a85-b456-8ffa17ef86a1",
  ]);
  assert.equal(listRolePresets(store.getState().overrides, "zh-CN")[0]?.name, "ZCode 官方");
});

test("invalid data or unavailable storage preserves seeds and reports load failure", () => {
  const storage = memoryStorage();
  for (const value of [
    "broken json",
    JSON.stringify({ version: 9, overrides: {} }),
    JSON.stringify({
      version: 3,
      overrides: { "04a923fa-2db3-4a85-b456-8ffa17ef86a1": { ...edited, identityPrompt: "" } },
    }),
  ]) {
    storage.setItem(ROLE_PRESETS_STORAGE_KEY, value);
    const store = createRoleManagementStore(() => storage);
    store.getState().hydrate();
    assert.equal(store.getState().loadError, "invalid");
    assert.equal(listRolePresets(store.getState().overrides, "zh-CN").length, 2);
  }
  const inaccessible = createRoleManagementStore(() => {
    throw new Error("denied");
  });
  inaccessible.getState().hydrate();
  assert.equal(inaccessible.getState().loadError, "storage");
});

test("role page participates in backward/forward navigation and survives task removal", () => {
  let history = pushNavEntry(createTaskNavigationHistory(), "/workspace", "task-1", "remote-a");
  history = pushPluginStoreNavEntry(history, "/workspace", "remote-a");
  history = pushRoleManagementNavEntry(history, "/workspace", "remote-a");
  assert.equal(goBack(history)?.entry.kind, "plugin-store");
  const previous = goBack(history)!;
  assert.equal(goForward(previous.history)?.entry.kind, "role-management");
  assert.equal(pushRoleManagementNavEntry(history, "/workspace", "remote-a"), history);
  const otherIdentity = pushRoleManagementNavEntry(history, "/workspace", "remote-b");
  assert.equal(otherIdentity.entries.length, 4);
  assert.equal(removeTaskFromHistory(otherIdentity, "task-1").entries.length, 3);
  const back = goBack(history)!;
  assert.equal(
    pushRoleManagementNavEntry(back.history, "/other").entries.at(-1)?.workspacePath,
    "/other",
  );
});

test("creation preserves order, UUID and fields after reload", () => {
  const storage = memoryStorage();
  const store = createRoleManagementStore(() => storage);
  assert.equal(store.getState().createRole(edited).ok, true);
  const restored = createRoleManagementStore(() => storage);
  restored.getState().hydrate();
  const roles = listRolePresets(restored.getState().overrides, "zh-CN");
  assert.equal(roles.length, 3);
  assert.match(roles[2]!.id, /^[0-9a-f-]{36}$/);
  assert.equal(roles[2]!.identityPrompt, edited.identityPrompt);
  assert.equal(
    restored.getState().updateRole(roles[2]!.id, { ...edited, name: "renamed" }).ok,
    true,
  );
  assert.equal(
    store.getState().createRole({ ...edited, expressionStylePrompt: " " }).error,
    "required",
  );
});

test("v1 migration retains original prompt and backup; failure does not delete legacy", () => {
  const storage = memoryStorage();
  const legacy = JSON.stringify({
    version: 1,
    overrides: {
      "04a923fa-2db3-4a85-b456-8ffa17ef86a1": {
        name: "Legacy",
        author: "Author",
        description: "",
        prompt: "original text",
      },
    },
  });
  storage.setItem(LEGACY_ROLE_PRESETS_STORAGE_KEY, legacy);
  const failed = createRoleManagementStore(() => ({
    getItem: storage.getItem,
    setItem: () => {
      throw new Error("quota");
    },
  }));
  failed.getState().hydrate();
  assert.equal(failed.getState().loadError, "storage");
  assert.equal(storage.getItem(LEGACY_ROLE_PRESETS_STORAGE_KEY), legacy);
  const store = createRoleManagementStore(() => storage);
  store.getState().hydrate();
  assert.equal(
    store.getState().overrides["04a923fa-2db3-4a85-b456-8ffa17ef86a1"]!.identityPrompt,
    "original text",
  );
  assert.ok(
    store.getState().overrides["04a923fa-2db3-4a85-b456-8ffa17ef86a1"]!.expressionStylePrompt,
  );
  assert.ok(storage.getItem(ROLE_PRESETS_STORAGE_KEY));
  assert.equal(storage.getItem(LEGACY_ROLE_PRESETS_STORAGE_KEY), legacy);
});
