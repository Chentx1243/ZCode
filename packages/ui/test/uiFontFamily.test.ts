import assert from "node:assert/strict";
import test from "node:test";

import {
  BUILTIN_SOURCE_HAN_SANS_SC_FONT_ID,
  DEFAULT_UI_FONT_FAMILY,
  DEFAULT_UI_FONT_FAMILY_STACK,
  applyUiFontFamily,
  loadUiFontFamily,
  normalizeUiFontFamily,
  resolveUiFontFamilyStack,
} from "../src/lib/uiFontFamily.js";

test("normalizeUiFontFamily 回退非法值到 system", () => {
  assert.equal(normalizeUiFontFamily(undefined), DEFAULT_UI_FONT_FAMILY);
  assert.equal(normalizeUiFontFamily(null), DEFAULT_UI_FONT_FAMILY);
  assert.equal(normalizeUiFontFamily(123), DEFAULT_UI_FONT_FAMILY);
  assert.equal(normalizeUiFontFamily(""), DEFAULT_UI_FONT_FAMILY);
  assert.equal(normalizeUiFontFamily("   "), DEFAULT_UI_FONT_FAMILY);
  assert.equal(normalizeUiFontFamily("x".repeat(129)), DEFAULT_UI_FONT_FAMILY);
});

test("normalizeUiFontFamily 剥离引号与控制字符，字体名不能携带 CSS 定界符", () => {
  assert.equal(normalizeUiFontFamily('"Microsoft YaHei"'), "Microsoft YaHei");
  assert.equal(normalizeUiFontFamily("'Arial'"), "Arial");
  assert.equal(normalizeUiFontFamily("  PingFang SC \n"), "PingFang SC");
  assert.equal(normalizeUiFontFamily("Micro\nsoft"), "Microsoft");
});

test("normalizeUiFontFamily 保留合法字体名与内置 id", () => {
  assert.equal(normalizeUiFontFamily("Microsoft YaHei"), "Microsoft YaHei");
  assert.equal(normalizeUiFontFamily("思源黑体 SC"), "思源黑体 SC");
  assert.equal(
    normalizeUiFontFamily(BUILTIN_SOURCE_HAN_SANS_SC_FONT_ID),
    BUILTIN_SOURCE_HAN_SANS_SC_FONT_ID,
  );
});

test("resolveUiFontFamilyStack 按取值生成字体栈", () => {
  assert.equal(resolveUiFontFamilyStack(DEFAULT_UI_FONT_FAMILY), DEFAULT_UI_FONT_FAMILY_STACK);
  assert.equal(resolveUiFontFamilyStack("system"), DEFAULT_UI_FONT_FAMILY_STACK);

  const builtinStack = resolveUiFontFamilyStack(BUILTIN_SOURCE_HAN_SANS_SC_FONT_ID);
  assert.match(builtinStack, /"Source Han Sans SC"/);
  assert.match(builtinStack, /"思源黑体 SC"/);
  assert.ok(builtinStack.endsWith(DEFAULT_UI_FONT_FAMILY_STACK));

  const systemFontStack = resolveUiFontFamilyStack("Microsoft YaHei");
  assert.ok(systemFontStack.startsWith('"Microsoft YaHei"'));
  assert.ok(systemFontStack.endsWith(DEFAULT_UI_FONT_FAMILY_STACK));
});

test("无 localStorage 环境加载回退默认值，apply 不抛错", () => {
  assert.equal(loadUiFontFamily(), DEFAULT_UI_FONT_FAMILY);
  // node 环境无 document，applyUiFontFamily 应为无操作而不是崩溃。
  applyUiFontFamily("Microsoft YaHei");
  applyUiFontFamily(BUILTIN_SOURCE_HAN_SANS_SC_FONT_ID);
});
