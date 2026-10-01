import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  resolveDesktopProductIdentity,
  resolveWindowsAppUserModelId,
} from "../scripts/desktop-product-identity.mjs";

test("DexCode identity is distinct and invalid or conflicting flags reject", () => {
  const identity = resolveDesktopProductIdentity({
    ZCODE_ENV: "production",
    ZCODE_DEXCODE_IDENTITY: "1",
  });
  assert.equal(identity.productName, "DexCode");
  assert.equal(identity.appId, "dev.dexcode.app");
  assert.equal(identity.flavor, "dexcode");
  assert.equal(resolveWindowsAppUserModelId({ ZCODE_DEXCODE_IDENTITY: "1" }), identity.appId);
  assert.equal(resolveDesktopProductIdentity({ ZCODE_ENV: "production" }).productName, "ZCode");
  assert.equal(resolveDesktopProductIdentity({ ZCODE_ENV: "test" }).productName, "ZCode Preview");
  assert.throws(() => resolveDesktopProductIdentity({ ZCODE_DEXCODE_IDENTITY: "true" }));
  assert.throws(() =>
    resolveDesktopProductIdentity({ ZCODE_DEXCODE_IDENTITY: "1", ZCODE_PREVIEW_IDENTITY: "1" }),
  );
});

test("packaging and startup preserve the official protocol and initialize before Services", async () => {
  const config = await readFile(new URL("../electron-builder.config.js", import.meta.url), "utf8");
  assert.match(config, /protocols:\s*desktopProductIdentity.flavor === "dexcode"\s*\?\s*\[\]/);
  const entry = await readFile(
    new URL("../src/main/desktopEarlyProductIsolationBootstrap.ts", import.meta.url),
    "utf8",
  );
  assert.ok(
    entry.indexOf("Object.assign(process.env") < entry.indexOf('await import("./index.js")'),
  );
  assert.ok(!entry.includes("@zcode/services"));
  const protocol = await readFile(
    new URL("../src/main/desktopOAuthDeepLink.ts", import.meta.url),
    "utf8",
  );
  assert.match(protocol, /if \(ZCODE_PRODUCT_FLAVOR === "dexcode"\) return/);
  const menu = await readFile(
    new URL("../src/main/desktopWindowsOpenFolderContextMenu.ts", import.meta.url),
    "utf8",
  );
  assert.match(menu, /DexCode.OpenInDexCode/);
});
