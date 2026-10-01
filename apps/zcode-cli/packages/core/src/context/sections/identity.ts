import { resolveRolePrompt, type RolePromptOverrides } from "@zcode/shared";
// ============================================================
// Identity Section Builder
// ============================================================

import type { ContextSection } from "../types.js";
import type { OutputStylePromptConfig } from "../types.js";
import { estimateTokens } from "../utils.js";

const SECURITY_NOTICE = resolveRolePrompt("security");

/** 安全 IMPORTANT 行：交互式身份与工作流子代理身份共用，逐字同一份。 */
export function buildSecurityNotice(): string {
  return SECURITY_NOTICE;
}

/**
 * `# Harness` 块：稳定运行时约束，不属于 output style 可替换的 coding instructions，
 * 也是工作流子代理身份（sections/workflow-actor.ts）逐字复用的那一段。
 */
export function buildHarnessBlock(overrides?: RolePromptOverrides): string {
  return resolveRolePrompt("harness", overrides);
}

function buildIdentityPrompt(
  outputStyle?: OutputStylePromptConfig,
  roleIdentity?: string,
  overrides?: RolePromptOverrides,
): string {
  const intro =
    roleIdentity ??
    (outputStyle
      ? "You respond to the user according to the active Output Style below while using ZCode's tools and instructions."
      : "You are an interactive ZCode agent that helps users with software engineering tasks.");

  const identityLines = ["", intro, "", resolveRolePrompt("security", overrides)].join("\n");

  return [identityLines, "", buildHarnessBlock(overrides)].join("\n");
}

export function buildIdentitySection(
  outputStyle?: OutputStylePromptConfig,
  roleIdentity?: string,
  overrides?: RolePromptOverrides,
): ContextSection {
  const content = buildIdentityPrompt(outputStyle, roleIdentity, overrides);

  return {
    name: "Agent Identity",
    source: "identity",
    injectionTarget: "system",
    cacheHint: "stable",
    chars: content.length,
    tokens: estimateTokens(content),
    content,
    preview: content.slice(0, 100),
  };
}
