import { readSafeLocalStorage } from "@/lib/browserEnvironment.js";

/** 内置思源黑体在字体选择中的稳定取值；映射到 @font-face 注册的 "Source Han Sans SC"。 */
export const BUILTIN_SOURCE_HAN_SANS_SC_FONT_ID = "builtin:source-han-sans-sc";

/** @font-face 注册的内置思源黑体 family 名。 */
export const BUILTIN_SOURCE_HAN_SANS_SC_FAMILY = '"Source Han Sans SC", "思源黑体 SC"';

export const UI_FONT_FAMILY_STORAGE_KEY = "zcode-ui-font-family";
export const DEFAULT_UI_FONT_FAMILY = "system";

/** 与 styles.css :root 的 --app-font-family 默认值保持一致，作为所选字体的回退栈。 */
export const DEFAULT_UI_FONT_FAMILY_STACK =
  'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';

/**
 * 规范化字体选择值：剥离引号与控制字符（字体名要拼进 CSS font-family 栈，不能携带定界符），
 * 空值或非法值回退 "system"。系统字体不做存在性校验，卸载后由栈尾回退。
 */
export function normalizeUiFontFamily(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_UI_FONT_FAMILY;
  }
  const normalized = value
    .replace(/["'`]/g, "")
    // eslint-disable-next-line no-control-regex -- 字体名来自 localStorage，需剥离换行等控制字符
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  if (!normalized || normalized.length > 128) {
    return DEFAULT_UI_FONT_FAMILY;
  }
  return normalized;
}

/** 把字体选择值解析为写入 --app-font-family 的完整字体栈。 */
export function resolveUiFontFamilyStack(value: string): string {
  const normalized = normalizeUiFontFamily(value);
  if (normalized === DEFAULT_UI_FONT_FAMILY) {
    return DEFAULT_UI_FONT_FAMILY_STACK;
  }
  if (normalized === BUILTIN_SOURCE_HAN_SANS_SC_FONT_ID) {
    return `${BUILTIN_SOURCE_HAN_SANS_SC_FAMILY}, ${DEFAULT_UI_FONT_FAMILY_STACK}`;
  }
  return `"${normalized}", ${DEFAULT_UI_FONT_FAMILY_STACK}`;
}

export function loadUiFontFamily(): string {
  return normalizeUiFontFamily(readSafeLocalStorage(UI_FONT_FAMILY_STORAGE_KEY));
}

export function applyUiFontFamily(value: string): void {
  const rootStyle = typeof document === "undefined" ? undefined : document.documentElement?.style;
  if (!rootStyle?.setProperty) {
    return;
  }
  // 只覆盖字体族变量，不触碰 html font-size，避免连带缩放图标与间距（与 --ui-font-size 同一约束）。
  rootStyle.setProperty("--app-font-family", resolveUiFontFamilyStack(value));
}

export function subscribeToUiFontFamilyStorageChanges(): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== UI_FONT_FAMILY_STORAGE_KEY) {
      return;
    }
    applyUiFontFamily(normalizeUiFontFamily(event.newValue));
  };

  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}
