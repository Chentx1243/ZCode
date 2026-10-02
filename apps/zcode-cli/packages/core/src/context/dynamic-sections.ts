import { resolveRolePrompt, type RolePromptOverrides } from "@zcode/shared";
import type { ContextBuilderConfig, ContextSection } from "./types.js";
import { estimateTokens } from "./utils.js";

const FINAL_MESSAGE_CONTRACT = resolveRolePrompt("finalReply");

const COMMUNICATION_PROMPTS = {
  additional: {
    beforeDefault: [
      "# Communicating with the user",
      "",
      `Your text output is what the user reads; they usually can't see your thinking or the raw tool results. Write it for a teammate who stepped away and is catching up, not for a log file: they don't know the codenames or shorthand you created along the way, and they didn't watch your process unfold. ${resolveRolePrompt("progress")}`,
      "",
      FINAL_MESSAGE_CONTRACT,
      "",
      'Lead with the outcome. Your first sentence after finishing should answer "what happened" or "what did you find" \u2014 the thing the user would ask for if they said "just give me the TLDR." Supporting detail and reasoning come after, for readers who want them.',
      "",
      "Being readable and being concise are different things, and readable matters more. If the user has to reread your summary or ask you to explain, any time saved by brevity is gone. The way to keep output short is to be selective about what you include (drop details that don't change what the reader would do next), not to compress the writing into fragments, abbreviations, arrow chains like `A \u2192 B \u2192 fails`, or jargon. What you do include, write in complete sentences with the technical terms spelled out. Don't make the reader cross-reference labels or numbering you invented earlier; say what you mean in place.",
      "",
      "Match the response to the question: a simple question gets a direct answer in prose, not headers and sections. Use tables only for short enumerable facts, with explanations in the surrounding prose rather than the cells. Calibrate to the user \u2014 a bit tighter for an expert, more explanatory for someone newer.",
    ].join("\n"),
  },
} as const;

export function buildSessionGuidanceSection(
  toolNames: readonly string[],
  hasSkills = false,
  overrides?: RolePromptOverrides,
): ContextSection | null {
  const tools = new Set(toolNames);
  const lines = ["# Session-specific guidance"];

  // 当前不输出 Agent 指导段。
  // if (tools.has("Agent")) {
  //   lines.push("- Use the Agent tool with specialized agents when the task at hand matches the agent's description. Subagents are valuable for parallelizing independent queries or for protecting the main context window from excessive results, but they should not be used excessively when not needed. Importantly, avoid duplicating work that subagents are already doing - if you delegate research to a subagent, do not also perform the same searches yourself.");

  //   let exploreGuide = "- For broad codebase exploration or research that'll take more than 3 queries, spawn Agent with subagent_type=Explore.";
  //   const fallbackSearch = getDirectSearchGuidance(tools);
  //   if (fallbackSearch) {
  //     exploreGuide += ` Otherwise use ${fallbackSearch} directly.`;
  //   }
  //   lines.push(exploreGuide);
  // }

  if (tools.has("Skill") && hasSkills) {
    lines.push(resolveRolePrompt("skillGuidance", overrides));
  }

  // if (tools.has("AskUserQuestion")) {
  //   lines.push("- Use AskUserQuestion when you need a bounded clarification before proceeding.");
  // }

  if (lines.length <= 1) {
    return null;
  }

  // 只有存在实际 session guidance 时才输出本段，避免向 simple branch 注入空标题。
  return createDynamicSection("Session-specific guidance", "session_guidance", lines.join("\n"));
}

export function buildDynamicBehaviorSection(
  roleExpressionStyle?: string,
  overrides?: RolePromptOverrides,
): ContextSection {
  return createDynamicSection(
    "Dynamic Behavior",
    "dynamic_behavior",
    [
      roleExpressionStyle === undefined
        ? COMMUNICATION_PROMPTS.additional.beforeDefault
        : [
            "# Communicating with the user",
            resolveRolePrompt("progress", overrides),
            resolveRolePrompt("finalReply", overrides),
            "# Role expression style",
            roleExpressionStyle,
          ].join("\n\n"),
      "",
      resolveRolePrompt("codeStyle", overrides),
      resolveRolePrompt("codeComments", overrides),
      "",
      resolveRolePrompt("authorization", overrides),
    ].join("\n"),
  );
}

export function buildOutputStyleSection(
  style: ContextBuilderConfig["outputStyle"],
): ContextSection | null {
  if (!style || style.prompt.trim().length === 0) return null;
  return createDynamicSection(
    "Output Style",
    "output_style",
    [`# Output Style: ${style.name}`, style.prompt.trim()].join("\n"),
  );
}

export function buildContextManagementSection(overrides?: RolePromptOverrides): ContextSection {
  return createDynamicSection(
    "Context Management",
    "context_management",
    resolveRolePrompt("contextManagement", overrides),
  );
}

function createDynamicSection(
  name: string,
  source: ContextSection["source"],
  content: string,
): ContextSection {
  return {
    name,
    source,
    injectionTarget: "system",
    cacheHint: "dynamic",
    chars: content.length,
    tokens: estimateTokens(content),
    content,
    preview: content.slice(0, 100),
  };
}
