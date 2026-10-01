import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { createDexCodeIsolationEnv } from "../src/main/desktopProductIsolation.js";
import { normalizeZCodeProductFlavor } from "../../shared/src/env.js";

test("isolated app, settings, sessions and Agent env share one independent root", () => {
  const env = createDexCodeIsolationEnv("/test/appData");
  const root = join("/test/appData", "DexCode");
  assert.equal(env.ZCODE_DESKTOP_USER_DATA_DIR, root);
  assert.equal(env.ZCODE_DESKTOP_SESSION_DATA_DIR, join(root, "session"));
  assert.equal(env.ZCODE_DATA_BASE_DIR, join(root, "home"));
  assert.equal(env.ZCODE_DESKTOP_HOME_DIR, env.ZCODE_DATA_BASE_DIR);
  assert.equal(env.ZCODE_HOME, join(root, "home", ".zcode"));
  assert.equal(env.ZCODE_DESKTOP_APPLICATION_NAME, "DexCode");
  assert.equal(normalizeZCodeProductFlavor("dexcode", "production"), "dexcode");
});
