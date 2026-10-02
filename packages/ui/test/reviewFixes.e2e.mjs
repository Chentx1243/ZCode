import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright-core";

// 隔离浏览器与本地 harness：直接使用交付组件，避免修改用户客户端、Provider 或 Windows 注册。
test(
  "review fixes: nested temperature reset, preset edits and corrupt storage",
  { timeout: 120_000 },
  async () => {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const harnessRoot = resolve(root, ".local-debug/review-ui");
    const require = createRequire(import.meta.url);
    await mkdir(harnessRoot, { recursive: true });
    const source = (path) => JSON.stringify(`/@fs/${resolve(root, path).replaceAll("\\", "/")}`);
    await writeFile(
      resolve(harnessRoot, "index.html"),
      '<div id="root"></div><script type="module" src="/main.tsx"></script>',
    );
    await writeFile(
      resolve(harnessRoot, "main.tsx"),
      `
    import React, { useState } from "react";
    import { createRoot } from "react-dom/client";
    import { ZCodeIntlProvider } from ${source("packages/ui/src/i18n/IntlProvider.tsx")};
    import { RoleManagementPage } from ${source("packages/ui/src/settings/RoleManagementPage.tsx")};
    import { readDraftRoleBinding, useRolePresets } from ${source("packages/ui/src/hooks/useRolePresets.ts")};
    import { rolePresetToBinding } from ${source("packages/ui/src/lib/rolePresets.ts")};
    import { TooltipProvider } from ${source("packages/ui/src/components/ui/tooltip.tsx")};
    import { useDraftSessionPrewarm } from ${source("packages/ui/src/v4/composer/useDraftSessionPrewarm.ts")};
    import ${source("packages/ui/src/styles.css")};
    const records = new Map();
    const transport = {};
    let serial = 0;
    const dispatchCommand = async (type, payload, sessionId) => {
      if (type === "createSession") {
        const id = "prewarm-" + ++serial;
        records.set(id, payload.config.roleBinding);
        return { status: "accepted", result: { type: "createSession", sessionId: id } };
      }
      if (type === "deleteSession") records.delete(sessionId);
      return { status: "accepted" };
    };
    function Harness() {
      const { roles, roleGeneration } = useRolePresets();
      const [selection, setSelection] = useState();
      const [selectionVersion, setSelectionVersion] = useState(0);
      const binding = readDraftRoleBinding(selection, "zh-CN");
      const { binding: prewarm } = useDraftSessionPrewarm({
        enabled: true, workspaceKey: "/review-test", paneId: "review",
        invalidationVersion: roleGeneration + selectionVersion,
        transportIdentity: transport, dispatchCommand,
        resolveInitialConfig: () => ({ roleBinding: readDraftRoleBinding(selection, "zh-CN") }),
      });
      return <main style={{ padding: 32 }}>
        <button data-testid="select-draft-dex" onClick={() => { setSelection(rolePresetToBinding(roles[1])); setSelectionVersion(v => v + 1); }}>选择草稿 DexCode</button>
        <output hidden data-testid="draft-binding">{JSON.stringify(binding)}</output>
        <output hidden data-testid="prewarm-binding">{JSON.stringify(records.get(prewarm?.sessionId))}</output>
        <output hidden data-testid="generation">{roleGeneration}</output>
        <RoleManagementPage />
      </main>;
    }
    createRoot(document.getElementById("root")).render(<ZCodeIntlProvider initialLocale="zh-CN"><TooltipProvider><Harness /></TooltipProvider></ZCodeIntlProvider>);
  `,
    );
    const server = await createServer({
      configFile: false,
      root: harnessRoot,
      plugins: [react(), tailwindcss()],
      resolve: {
        alias: {
          "@": resolve(root, "packages/ui/src"),
          react: dirname(require.resolve("react/package.json")),
          "react-dom": dirname(require.resolve("react-dom/package.json")),
        },
      },
      server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
    });
    let browser;
    try {
      await server.listen();
      const address = server.httpServer.address();
      const url = `http://127.0.0.1:${address.port}`;
      browser = await chromium.launch({
        headless: true,
        ...(process.env.ZCODE_REVIEW_BROWSER
          ? { executablePath: process.env.ZCODE_REVIEW_BROWSER }
          : { channel: "msedge" }),
      });
      const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(url);
      const dex = page.locator('[data-role-id="04a923fa-2db3-4a85-b456-8ffa17ef86a1"]');
      await dex.waitFor();
      await page.getByTestId("select-draft-dex").click();
      const initialGeneration = Number(await page.getByTestId("generation").textContent());
      const openPersonality = async () => {
        await dex.click();
        await page.getByTestId("role-personality-open").click();
        await page.getByTestId("role-advanced-toggle").click();
      };
      const unlockTemperature = async () => {
        await page.getByTestId("role-unlock-temperature").click();
        await page.getByTestId("role-unlock-confirm").click();
        await page.getByTestId("role-unlock-warning").waitFor({ state: "hidden" });
      };
      await openPersonality();
      await unlockTemperature();
      await page.getByTestId("role-advanced-temperature").fill("0.7");
      await page.getByTestId("role-personality-confirm").click();
      await page.getByTestId("role-save").click();
      await openPersonality();
      assert.equal(await page.getByTestId("role-advanced-temperature").inputValue(), "0.7");
      await unlockTemperature();
      await page.getByTestId("role-reset-temperature").click();
      await page.getByTestId("role-personality-confirm").click();
      // 内层确认再打开：验证详情草稿的 spread 合并确实清掉旧值。
      await page.getByTestId("role-personality-open").click();
      await page.getByTestId("role-advanced-toggle").click();
      assert.equal(await page.getByTestId("role-advanced-temperature").inputValue(), "");
      await page.getByTestId("role-personality-confirm").click();
      await page.getByTestId("role-save").click();
      await openPersonality();
      assert.equal(await page.getByTestId("role-advanced-temperature").inputValue(), "");
      await page.getByTestId("role-field-identityPrompt").fill("edited non-default draft role");
      await page.getByTestId("role-personality-confirm").click();
      await page.getByTestId("role-save").click();
      const binding = JSON.parse(await page.getByTestId("draft-binding").textContent());
      assert.equal(binding.identityPrompt, "edited non-default draft role");
      await page.waitForFunction(() =>
        document
          .querySelector('[data-testid="prewarm-binding"]')
          .textContent.includes("edited non-default draft role"),
      );
      assert.deepEqual(
        JSON.parse(await page.getByTestId("prewarm-binding").textContent()),
        binding,
      );
      assert.ok(!("temperature" in binding));
      assert.ok(Number(await page.getByTestId("generation").textContent()) > initialGeneration);
      const saved = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("zcode-role-presets-v3")),
      );
      assert.equal(saved.selectedRoleId, "zcode-official");
      assert.ok(!("temperature" in saved.overrides[binding.roleId]));
      await page.screenshot({ path: resolve(harnessRoot, "reset-and-edit.png") });
      await page.evaluate(() => localStorage.setItem("zcode-role-presets-v3", "broken json"));
      await page.reload();
      await page.getByRole("alert").waitFor();
      assert.deepEqual(JSON.parse(await page.getByTestId("draft-binding").textContent()), {
        kind: "official",
      });
      assert.match(await page.getByRole("alert").innerText(), /未能恢复/);
      assert.equal(
        await page.evaluate(() => localStorage.getItem("zcode-role-presets-v3")),
        "broken json",
      );
      assert.equal(await page.getByTestId("role-preset-card").count(), 2);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: resolve(harnessRoot, "corrupt-storage.png") });
    } finally {
      await browser?.close();
      await server.close();
    }
  },
);
