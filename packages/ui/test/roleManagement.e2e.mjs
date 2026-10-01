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
      v3: localStorage.getItem("zcode-role-presets-v3"),
      locale: localStorage.getItem("zcode-locale-preference"),
    }));
    const originalViewport = page.viewportSize();
    const openRoles = async () => {
      // 空 Provider 的隔离客户端重载后会打开登录页，走公开跳过入口，不注入凭据。
      const entry = page.getByRole("button", { name: /^(使用 API key|Use API key)$/ });
      await Promise.race([
        entry.waitFor(),
        page.getByTestId("role-management-sidebar-open").waitFor(),
      ]);
      if (await entry.isVisible()) {
        await entry.click();
        await page.getByRole("button", { name: /^(暂时跳过|Skip for now)$/ }).click();
      }
      await page.getByTestId("role-management-sidebar-open").click();
      await page.getByTestId("role-create").waitFor();
    };
    const card = (id) => page.locator(`[data-role-id="${id}"]`);
    try {
      await page.evaluate(() => {
        localStorage.removeItem("zcode-role-presets-v1");
        localStorage.removeItem("zcode-role-presets-v2");
        localStorage.removeItem("zcode-role-presets-v3");
      });
      await page.reload();
      await openRoles();
      assert.equal(await page.locator("[data-role-id]").count(), 2);
      assert.equal(await card("general-assistant").count(), 0);
      assert.equal(await card("writing-partner").count(), 0);
      assert.match(await card("04a923fa-2db3-4a85-b456-8ffa17ef86a1").innerText(), /DexCode/);
      await card("zcode-official").focus();
      await page.keyboard.press("Enter");
      await page.getByTestId("role-personality-open").click();
      const personality = page.getByTestId("role-personality-dialog");
      assert.match(await personality.innerText(), /Zcode官方默认角色，无法修改，仅供参考/);
      for (const field of ["identityPrompt", "expressionStylePrompt"])
        assert.equal(await page.getByTestId(`role-field-${field}`).getAttribute("readonly"), "");
      const officialIdentity = await page.getByTestId("role-field-identityPrompt").inputValue();
      const officialStyle = await page.getByTestId("role-field-expressionStylePrompt").inputValue();
      assert.equal(
        await page.getByTestId("role-advanced-toggle").getAttribute("aria-expanded"),
        "false",
      );
      await page.getByTestId("role-advanced-toggle").click();
      const advancedKeys = [
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
      for (const key of advancedKeys) {
        assert.equal(await page.getByTestId("role-advanced-" + key).getAttribute("readonly"), "");
        assert.ok((await page.getByTestId("role-advanced-" + key).inputValue()).length > 0);
        await page.getByTestId("role-reference-" + key).hover();
        const reference = page.getByTestId("role-reference-content-" + key);
        await reference.waitFor();
        assert.match(await reference.innerText(), /默认提示词中文参考/);
        assert.ok((await reference.locator('[lang="zh-CN"]').first().innerText()).length > 20);
        await page.keyboard.press("Escape");
        await page.getByTestId(`role-advanced-${key}`).focus();
        await reference.waitFor({ state: "hidden" });
      }
      assert.equal(await page.locator('[data-testid^="role-unlock-"]').count(), 0);
      assert.equal(await page.locator('[data-testid^="role-reset-"]').count(), 0);
      const officialCodeStyle = await page.getByTestId("role-advanced-codeStyle").inputValue();
      await page.getByTestId("role-advanced-codeStyle").focus();
      await page.keyboard.press("Control+A");
      assert.equal(
        await page
          .getByTestId("role-advanced-codeStyle")
          .evaluate((el) => el.selectionEnd - el.selectionStart),
        officialCodeStyle.length,
      );
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
      await card("04a923fa-2db3-4a85-b456-8ffa17ef86a1").click();
      await page.getByTestId("role-set-default").click();
      assert.equal(
        await card("04a923fa-2db3-4a85-b456-8ffa17ef86a1")
          .getByTestId("role-default-badge")
          .count(),
        1,
      );
      await page.getByTestId("task-new-button").click();
      assert.match(await page.getByTestId("current-role").innerText(), /DexCode/);
      await page.reload();
      await openRoles();
      assert.equal(
        await card("04a923fa-2db3-4a85-b456-8ffa17ef86a1")
          .getByTestId("role-default-badge")
          .count(),
        1,
      );
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
      assert.equal(await page.getByTestId("role-preset-card").count(), 3);
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
      assert.equal(
        await page.getByTestId("role-advanced-toggle").getAttribute("aria-expanded"),
        "false",
      );
      await page.getByTestId("role-advanced-toggle").click();
      const codeStyle = page.getByTestId("role-advanced-codeStyle");
      const harness = page.getByTestId("role-advanced-harness");
      assert.equal(await harness.getAttribute("readonly"), "");
      assert.equal(await codeStyle.getAttribute("readonly"), null);
      await page.getByTestId("role-unlock-harness").click();
      const warning = page.getByTestId("role-unlock-warning");
      assert.match(await warning.innerText(), /修改该提示词可能影响 ZCode 的工作效果，请谨慎修改/);
      assert.equal(
        await page
          .getByTestId("role-unlock-cancel")
          .evaluate((el) => el === document.activeElement),
        true,
      );
      await page.keyboard.press("Escape");
      await warning.waitFor({ state: "hidden" });
      assert.equal(await personality.count(), 1);
      assert.equal(await harness.getAttribute("readonly"), "");
      assert.equal(
        await page
          .getByTestId("role-unlock-harness")
          .evaluate((el) => el === document.activeElement),
        true,
      );
      await page.getByTestId("role-unlock-harness").click();
      await page.getByTestId("role-unlock-confirm").click();
      await warning.waitFor({ state: "hidden" });
      assert.equal(await harness.getAttribute("readonly"), null);
      await harness.fill("Custom harness instruction");
      await codeStyle.fill("Custom code style");
      await page.getByTestId("role-reference-codeStyle").focus();
      await page.getByTestId("role-reference-content-codeStyle").waitFor();
      assert.match(
        await page.getByTestId("role-reference-content-codeStyle").innerText(),
        /编写与周围代码风格一致/,
      );
      await codeStyle.focus();
      assert.match(await page.getByTestId("role-advanced-count").innerText(), /2/);
      await page.getByTestId("role-advanced-toggle").click();
      await page.getByTestId("role-advanced-content").waitFor({ state: "hidden" });
      assert.match(await page.getByTestId("role-advanced-count").innerText(), /2/);
      await page.getByTestId("role-advanced-toggle").click();
      assert.equal(await harness.getAttribute("readonly"), null);
      assert.equal(await codeStyle.inputValue(), "Custom code style");
      await codeStyle.fill(" ");
      await page.getByTestId("role-advanced-toggle").click();
      await page.getByTestId("role-advanced-content").waitFor({ state: "hidden" });
      await page.getByTestId("role-personality-confirm").click();
      assert.equal(
        await page.getByTestId("role-advanced-toggle").getAttribute("aria-expanded"),
        "true",
      );
      assert.equal(await codeStyle.getAttribute("aria-invalid"), "true");
      assert.equal(await codeStyle.evaluate((el) => el === document.activeElement), true);
      await page.getByTestId("role-reset-codeStyle").click();
      assert.equal(await codeStyle.inputValue(), officialCodeStyle);
      assert.match(await page.getByTestId("role-advanced-count").innerText(), /1/);
      await codeStyle.fill("Custom code style");
      await page.getByTestId("role-personality-confirm").click();
      await page.getByTestId("role-field-name").fill("Saved UI role");
      await page.evaluate(() => {
        window.__roleOriginalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key === "zcode-role-presets-v3") throw new Error("quota");
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
      assert.equal(
        await page.getByTestId("role-advanced-toggle").getAttribute("aria-expanded"),
        "false",
      );
      assert.match(await page.getByTestId("role-advanced-count").innerText(), /2/);
      await page.getByTestId("role-advanced-toggle").click();
      assert.equal(await harness.getAttribute("readonly"), "");
      assert.equal(await harness.inputValue(), "Custom harness instruction");
      assert.equal(await codeStyle.inputValue(), "Custom code style");
      await page.getByTestId("role-unlock-harness").click();
      await page.getByTestId("role-unlock-confirm").click();
      await page.getByTestId("role-reset-harness").click();
      assert.notEqual(await harness.inputValue(), "Custom harness instruction");
      await page.getByTestId("role-unlock-finalReply").click();
      await page.getByTestId("role-unlock-cancel").click();
      assert.equal(await page.getByTestId("role-advanced-finalReply").getAttribute("readonly"), "");
      await page.getByTestId("role-advanced-codeComments").fill("Long text ".repeat(300));
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
      await page.evaluate(() => localStorage.setItem("zcode-locale-preference", "en-US"));
      await page.reload();
      await openRoles();
      await card(id).click();
      await page.getByTestId("role-personality-open").click();
      assert.match(
        await page.getByTestId("role-advanced-toggle").innerText(),
        /Advanced configuration/,
      );
      assert.equal(
        await page.getByTestId("role-field-identityPrompt").inputValue(),
        "saved identity",
      );
      await page.getByTestId("role-advanced-toggle").click();
      assert.equal(await codeStyle.inputValue(), "Custom code style");
      assert.equal(await harness.getAttribute("readonly"), "");
      await page.getByTestId("role-unlock-harness").click();
      assert.match(
        await page.getByTestId("role-unlock-warning").innerText(),
        /may affect how ZCode works/,
      );
      await page.getByTestId("role-unlock-cancel").click();
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      console.log(
        "Desktop/mobile light/dark, Chinese/English, creation, nested cancel, persistence, failure and navigation verified.",
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
          ["zcode-role-presets-v3", backup.v3],
          ["zcode-locale-preference", backup.locale],
        ]) {
          if (value === null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
        }
      }, backup);
      if (originalViewport) await page.setViewportSize(originalViewport);
      try {
        await page.reload();
        await openRoles();
      } finally {
        await browser.close();
      }
    }
  },
);
