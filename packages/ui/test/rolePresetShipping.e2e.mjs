import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright-core";

test(
  "fresh clients receive DexCode without import and retain its default selection",
  { timeout: 60_000 },
  async () => {
    const browser = await chromium.connectOverCDP(
      process.env.ZCODE_ROLE_E2E_CDP ?? "http://127.0.0.1:9229",
    );
    const page = browser.contexts()[0].pages()[0];
    const keys = ["zcode-role-presets-v1", "zcode-role-presets-v2", "zcode-role-presets-v3"];
    const backup = await page.evaluate(
      (keys) => keys.map((key) => [key, localStorage.getItem(key)]),
      keys,
    );
    const dexId = "04a923fa-2db3-4a85-b456-8ffa17ef86a1";
    const openRoles = async () => {
      await page.getByTestId("role-management-sidebar-open").click();
      await page.getByTestId("role-create").waitFor();
    };
    try {
      await page.evaluate((keys) => keys.forEach((key) => localStorage.removeItem(key)), keys);
      await page.reload();
      await openRoles();
      assert.deepEqual(
        await page
          .getByTestId("role-preset-card")
          .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-role-id"))),
        ["zcode-official", dexId],
      );
      const dex = page.locator(`[data-role-id="${dexId}"]`);
      assert.match(await dex.innerText(), /DexCode/);
      await dex.click();
      await page.getByTestId("role-personality-open").click();
      assert.match(
        await page.getByTestId("role-field-identityPrompt").inputValue(),
        /You are DexCode/,
      );
      await page.getByTestId("role-advanced-toggle").click();
      assert.match(
        await page.getByTestId("role-advanced-progress").inputValue(),
        /Before the first tool call/,
      );
      assert.match(
        await page.getByTestId("role-advanced-finalReply").inputValue(),
        /may not be shown to the user/,
      );
      assert.match(await page.getByTestId("role-advanced-count").innerText(), /4/);
      await page.keyboard.press("Escape");
      await page.getByTestId("role-set-default").click();
      await page.reload();
      await openRoles();
      assert.equal(await dex.getByTestId("role-default-badge").count(), 1);
      assert.equal(await page.getByTestId("role-preset-card").count(), 2);
    } finally {
      // 临时空存储验证后恢复全部原记录，不覆盖用户手动修改的预设或默认选择。
      await page.evaluate((backup) => {
        for (const [key, value] of backup) {
          if (value === null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
        }
      }, backup);
      await page.reload();
      await openRoles();
      await browser.close();
    }
  },
);
