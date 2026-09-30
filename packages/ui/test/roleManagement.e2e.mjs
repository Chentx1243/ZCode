import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";

// 使用隔离调试客户端，测试结束恢复原有角色存储，避免污染手动调试数据。
test(
  "role creation, nested drafts, official protection, persistence and responsive UI",
  { timeout: 120_000 },
  async () => {
    const browser = await chromium.connectOverCDP(
      process.env.ZCODE_ROLE_E2E_CDP ?? "http://127.0.0.1:9229",
    );
    const page = browser.contexts()[0].pages()[0];
    page.setDefaultTimeout(10_000);
    const backup = await page.evaluate(() => ({
      v1: localStorage.getItem("zcode-role-presets-v1"),
      v2: localStorage.getItem("zcode-role-presets-v2"),
    }));
    const originalViewport = page.viewportSize();
    const openRoles = async () => {
      await page.getByTestId("role-management-sidebar-open").click();
      await page.getByTestId("role-create").waitFor();
    };
    const card = (id) => page.locator(`[data-role-id="${id}"]`);
    try {
      await page.evaluate(() => {
        localStorage.removeItem("zcode-role-presets-v1");
        localStorage.removeItem("zcode-role-presets-v2");
      });
      await page.reload();
      await openRoles();
      await card("zcode-official").focus();
      await page.keyboard.press("Enter");
      await page.getByTestId("role-personality-open").click();
      const personality = page.getByTestId("role-personality-dialog");
      assert.match(await personality.innerText(), /Zcode官方默认角色，无法修改，仅供参考/);
      for (const field of ["identityPrompt", "expressionStylePrompt"])
        assert.equal(await page.getByTestId(`role-field-${field}`).getAttribute("readonly"), "");
      const officialIdentity = await page.getByTestId("role-field-identityPrompt").inputValue();
      const officialStyle = await page.getByTestId("role-field-expressionStylePrompt").inputValue();
      await page.keyboard.press("Escape");
      await personality.waitFor({ state: "hidden" });
      assert.equal(await page.getByTestId("role-detail-dialog").count(), 1);
      assert.equal(
        await page
          .getByTestId("role-personality-open")
          .evaluate((el) => el === document.activeElement),
        true,
      );
      await page.keyboard.press("Escape");
      await card("writing-partner").click();
      await page.getByTestId("role-set-default").click();
      assert.equal(await card("writing-partner").getByTestId("role-default-badge").count(), 1);
      await page.getByTestId("task-new-button").click();
      assert.match(await page.getByTestId("current-role").innerText(), /写作伙伴/);
      await page.reload();
      await openRoles();
      assert.equal(await card("writing-partner").getByTestId("role-default-badge").count(), 1);
      await card("zcode-official").click();
      await page.getByTestId("role-set-default").click();
      await page.getByTestId("task-new-button").click();
      assert.match(await page.getByTestId("current-role").innerText(), /ZCode 官方/);
      await openRoles();
      await page.getByTestId("role-search").fill("no matching role");
      await page.getByTestId("role-create").click();
      assert.equal(
        await page.getByTestId("role-field-identityPrompt").inputValue(),
        officialIdentity,
      );
      assert.equal(
        await page.getByTestId("role-field-expressionStylePrompt").inputValue(),
        officialStyle,
      );
      assert.equal(await page.getByTestId("role-save").isDisabled(), true);
      await page.getByTestId("role-field-name").fill("UI test role");
      await page.getByTestId("role-field-expressionStylePrompt").fill(" ");
      assert.equal(await page.getByTestId("role-save").isDisabled(), true);
      await page.getByTestId("role-field-expressionStylePrompt").fill("温和直接");
      await page.getByTestId("role-save").click();
      assert.equal(await page.getByTestId("role-search").inputValue(), "");
      assert.equal(await page.getByTestId("role-preset-card").count(), 4);
      const id = await page.getByTestId("role-preset-card").last().getAttribute("data-role-id");
      await card(id).click();
      await page.getByTestId("role-personality-open").click();
      await page.getByTestId("role-field-identityPrompt").fill("discard inner");
      await page.keyboard.press("Escape");
      await page.getByTestId("role-personality-open").click();
      assert.equal(
        await page.getByTestId("role-field-identityPrompt").inputValue(),
        officialIdentity,
      );
      await page.getByTestId("role-field-identityPrompt").fill("discard outer");
      await page.getByTestId("role-personality-confirm").click();
      await page.keyboard.press("Escape");
      await card(id).click();
      await page.getByTestId("role-personality-open").click();
      assert.equal(
        await page.getByTestId("role-field-identityPrompt").inputValue(),
        officialIdentity,
      );
      await page.getByTestId("role-field-identityPrompt").fill("saved identity");
      await page.getByTestId("role-personality-confirm").click();
      await page.getByTestId("role-field-name").fill("Saved UI role");
      await page.evaluate(() => {
        window.__roleOriginalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key === "zcode-role-presets-v2") throw new Error("quota");
          return window.__roleOriginalSetItem.call(this, key, value);
        };
      });
      await page.getByTestId("role-save").click();
      assert.match(await page.getByRole("alert").innerText(), /保存失败/);
      assert.match(await card(id).innerText(), /UI test role/);
      await page.evaluate(() => {
        Storage.prototype.setItem = window.__roleOriginalSetItem;
        delete window.__roleOriginalSetItem;
      });
      await page.getByTestId("role-save").click();
      await page.reload();
      await openRoles();
      await card(id).click();
      await page.getByTestId("role-personality-open").click();
      assert.equal(
        await page.getByTestId("role-field-identityPrompt").inputValue(),
        "saved identity",
      );
      await page.getByTestId("role-field-expressionStylePrompt").fill(officialStyle.repeat(8));
      const artifacts = process.env.ZCODE_ROLE_E2E_ARTIFACT_DIR;
      for (const width of [1360, 390]) {
        await page.setViewportSize({ width, height: 850 });
        for (const dark of [false, true]) {
          await page.evaluate((dark) => {
            document.documentElement.classList.toggle("dark", dark);
            document.documentElement.classList.toggle("theme-zai-dark", dark);
            document.documentElement.classList.toggle("theme-zai-light", !dark);
          }, dark);
          const bounds = await personality.boundingBox();
          assert.ok(bounds.width <= width);
          assert.ok(bounds.y >= 0);
          const confirmBounds = await page.getByTestId("role-personality-confirm").boundingBox();
          assert.ok(confirmBounds.y + confirmBounds.height <= 850);
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            true,
          );
          if (artifacts) {
            await mkdir(artifacts, { recursive: true });
            await page.screenshot({
              path: join(artifacts, `role-personality-${width}-${dark ? "dark" : "light"}.png`),
            });
          }
        }
      }
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await page.setViewportSize({ width: 1360, height: 850 });
      await page.getByTestId("plugin-store-sidebar-open").click();
      await page.getByTestId("plugin-store-search").waitFor();
      await page.getByTestId("task-new-button").click();
      assert.equal(await page.getByTestId("role-management-page").count(), 0);
      console.log(
        "Desktop/mobile light/dark, creation, nested cancel, persistence, failure and navigation verified.",
      );
    } finally {
      await page.evaluate((backup) => {
        if (window.__roleOriginalSetItem) {
          Storage.prototype.setItem = window.__roleOriginalSetItem;
          delete window.__roleOriginalSetItem;
        }
        for (const [key, value] of [
          ["zcode-role-presets-v1", backup.v1],
          ["zcode-role-presets-v2", backup.v2],
        ]) {
          if (value === null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
        }
      }, backup);
      if (originalViewport) await page.setViewportSize(originalViewport);
      await page.reload();
      await openRoles();
      await browser.close();
    }
  },
);
