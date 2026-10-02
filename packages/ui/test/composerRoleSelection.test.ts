import assert from "node:assert/strict";
import test from "node:test";
import { resolveComposerRoleId } from "../src/v4/composer/draftWorkspaceDefaults.js";

const dexcodeRoleId = "04a923fa-2db3-4a85-b456-8ffa17ef86a1";
const dexcodeBinding = {
  kind: "custom" as const,
  roleId: dexcodeRoleId,
  name: "DexCode",
  identityPrompt: "You are DexCode.",
  expressionStylePrompt: "Natural and structured.",
};

// 回归：全局默认为自定义角色时，草稿显式选择官方后选中态必须显示官方，
// 不能落回默认角色（binding 已切换但 UI 高亮停在默认角色，显示与事实相反）。
test("draft with explicit official binding shows official even when default is a custom role", () => {
  assert.equal(
    resolveComposerRoleId({
      roleBinding: { kind: "official" },
      sessionId: null,
      defaultRoleId: dexcodeRoleId,
    }),
    "zcode-official",
  );
});

test("draft without a binding falls back to the global default role", () => {
  assert.equal(
    resolveComposerRoleId({ roleBinding: undefined, sessionId: null, defaultRoleId: dexcodeRoleId }),
    dexcodeRoleId,
  );
});

test("custom binding keeps its roleId regardless of session or default", () => {
  assert.equal(
    resolveComposerRoleId({
      roleBinding: dexcodeBinding,
      sessionId: null,
      defaultRoleId: "zcode-official",
    }),
    dexcodeRoleId,
  );
  assert.equal(
    resolveComposerRoleId({
      roleBinding: dexcodeBinding,
      sessionId: "session-1",
      defaultRoleId: "zcode-official",
    }),
    dexcodeRoleId,
  );
});

test("existing session without a binding shows official", () => {
  assert.equal(
    resolveComposerRoleId({
      roleBinding: undefined,
      sessionId: "session-1",
      defaultRoleId: dexcodeRoleId,
    }),
    "zcode-official",
  );
});
