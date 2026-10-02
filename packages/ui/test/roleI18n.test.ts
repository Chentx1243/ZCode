import assert from "node:assert/strict";
import test from "node:test";
import zhCN from "../src/i18n/locales/zh-CN.js";
import enUS from "../src/i18n/locales/en-US.js";

test("role translation keys are present and nonempty in both shipped locales", () => {
  const keys = (messages: Record<string, string>) =>
    Object.keys(messages)
      .filter((key) => key.startsWith("roles."))
      .sort();
  assert.deepEqual(keys(zhCN), keys(enUS));
  for (const key of keys(enUS)) {
    assert.ok(zhCN[key]?.trim(), key);
    assert.ok(enUS[key]?.trim(), key);
  }
});
