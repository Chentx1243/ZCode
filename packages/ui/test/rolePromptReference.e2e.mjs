import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright-core";

test(
  "default Chinese references support hover, focus and narrow viewports without editing",
  { timeout: 60_000 },
  async () => {
    const browser = await chromium.connectOverCDP(
      process.env.ZCODE_ROLE_E2E_CDP ?? "http://127.0.0.1:9229",
    );
    const page = browser.contexts()[0].pages()[0];
    const viewport = page.viewportSize();
    try {
      await page.getByTestId("role-management-sidebar-open").click();
      await page.locator('[data-role-id="zcode-official"]').click();
      await page.getByTestId("role-personality-open").click();
      await page.getByTestId("role-advanced-toggle").click();
      const keys = [
        "codeStyle",
        "codeComments",
        "progress",
        "finalReply",
        "authorization",
        "security",
        "harness",
        "contextManagement",
        "desktop",
        "skillGuidance",
        "memory",
        "projectInstructions",
      ];
      for (const key of keys) {
        await page.getByTestId(`role-reference-${key}`).hover();
        const content = page.getByTestId(`role-reference-content-${key}`);
        await content.waitFor();
        assert.match(await content.innerText(), /默认提示词中文参考/);
        assert.ok((await content.locator('[lang="zh-CN"]').first().innerText()).length > 20);
        await page.keyboard.press("Escape");
        await page.getByTestId(`role-advanced-${key}`).focus();
        await content.waitFor({ state: "hidden" });
      }
      await page.getByTestId("role-reference-codeStyle").focus();
      await page.getByTestId("role-reference-content-codeStyle").waitFor();
      await page.keyboard.press("Escape");
      await page.getByTestId("role-reference-content-codeStyle").waitFor({ state: "hidden" });
      assert.equal(await page.getByTestId("role-personality-dialog").count(), 1);
      await page.setViewportSize({ width: 390, height: 850 });
      await page.getByTestId("role-reference-memory").hover();
      const longReference = page.getByTestId("role-reference-content-memory");
      await longReference.waitFor();
      const bounds = await longReference.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 850);
      assert.equal(await longReference.evaluate((el) => el.scrollHeight > el.clientHeight), true);
      await longReference.hover();
      await page.mouse.wheel(0, 350);
      await page.waitForFunction(
        () => document.querySelector('[data-testid="role-reference-content-memory"]').scrollTop > 0,
      );
      await page.keyboard.press("Escape");
      await longReference.waitFor({ state: "hidden" });
    } finally {
      if (viewport) await page.setViewportSize(viewport);
      await page.mouse.move(0, 0);
      for (const id of ["role-personality-dialog", "role-detail-dialog"]) {
        const dialog = page.getByTestId(id);
        if (await dialog.count()) {
          await dialog.getByRole("button", { name: "Close", exact: true }).click();
          await dialog.waitFor({ state: "hidden" });
        }
      }
      await browser.close();
    }
  },
);
