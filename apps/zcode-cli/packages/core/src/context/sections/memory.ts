import { resolveRolePrompt, type RolePromptOverrides } from "@zcode/shared";
// ============================================================
// Memory Section Builder
// ============================================================

import type { ContextSection } from "../types.js";
import { estimateTokens } from "../utils.js";

export function buildMemorySection(
  memoryRoot: string | undefined,
  overrides?: RolePromptOverrides,
): ContextSection | null {
  if (!memoryRoot) return null;

  const content = buildMemoryContent(memoryRoot, overrides);

  return {
    name: "Memory",
    source: "memory",
    injectionTarget: "system",
    cacheHint: "dynamic",
    chars: content.length,
    tokens: estimateTokens(content),
    content,
    preview: content.slice(0, 100),
  };
}

function buildMemoryContent(memoryRoot: string, overrides?: RolePromptOverrides): string {
  return (
    "# Memory\n\n" +
    `You have a persistent file-based memory at \`${memoryRoot}/\`. ` +
    resolveRolePrompt("memory", overrides)
  );
}
