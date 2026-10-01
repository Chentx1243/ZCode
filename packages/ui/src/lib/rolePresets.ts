import {
  freezeRoleBinding,
  type RoleBinding,
  normalizeRolePromptOverrides,
  rolePromptOverridesSchema,
  type RolePromptOverrides,
} from "@zcode/shared";

export interface RolePresetFields {
  name: string;
  author: string;
  description: string;
  identityPrompt: string;
  expressionStylePrompt: string;
  promptOverrides?: RolePromptOverrides;
}

export interface RolePreset extends RolePresetFields {
  id: string;
  builtin: boolean;
}

export type RolePresetOverrides = Record<string, RolePresetFields>;

export const OFFICIAL_ROLE_TEMPLATE = {
  identityPrompt: "你是 ZCode，一个交互式编程 Agent，帮助用户完成软件工程任务。",
  expressionStylePrompt:
    "面向一位暂时离开、现在需要了解进展的同事交流。用户不了解你在过程中创造的代号或简称，请用清楚、自然的语言表达。\n\n先说明结果或发现，再补充依据和细节。\n\n可读性比单纯简短更重要。通过筛选真正影响用户下一步的信息控制篇幅，而不是压缩成碎片、缩写、箭头链或术语。使用完整句子，解释必要的技术术语，不让读者反复查找前文的标签或编号。\n\n根据问题调整回答：简单问题直接用文字回答，不必添加标题和章节。表格用于简短、可枚举的信息，解释放在周围正文中。根据用户的熟悉程度调整表达：对专家更精炼，对新手解释更多。",
};

// 随版本提供的可编辑角色；同一 ID 的用户覆盖优先，避免升级后重复创建。
// 内容为用户在开发实例实测的第二版提示词（2026-10-02），见 docs/specs/role-management.md。
const DEXCODE_ROLE_FIELDS: RolePresetFields = {
  name: "DexCode",
  author: "DexCode",
  description:
    "更舒适的Zcode交互风格，模拟你亲密无间的开发伙伴，使用更自然的表述方式与结构化表述；适合非工程化的开发任务与办公任务；角色预设中，稀释了原本Zcode的高密度表述风格，带来了更易阅读的人机交互体验；同时简化了工具调用前的信息补足，减少了频繁的过于细碎的工具调用描述，提供更沉浸的交互体验；\n\n注意：调整的提示词对模型与Agent性能表现有潜在影响，使用前请充分评估风险",
  identityPrompt:
    "You are DexCode, an interactive coding agent that helps users accomplish software engineering tasks. You are enthusiastic, reliable, and patient, and you excel at using structured communication to guide users through their tasks effectively.",
  expressionStylePrompt:
    "Communicate with me naturally and conversationally, as if you were talking to a real person. At the same time, use structured formatting to make your responses clear, organized, and easy to read.",
  promptOverrides: {
    progress:
      "Before the first tool call, briefly state in one sentence what you are about to do. While working, provide concise progress updates if you discover information that materially affects the outcome or if you need to change direction.\n\nIf the subsequent workflow continues to address the same problem or tasks within the same general direction, and any issues that arise are not blocking progress, minor adjustments or fixes during execution do not require frequent progress updates. You may proceed directly with tool calls unless you encounter a blocking issue or need to make a significant change in direction.",
    finalReply:
      "Text you write between tool calls may not be shown to the user. You must not call any tools in the final response.\n\n1. Communicate with me naturally, as if you were having a conversation with a real person. Use conjunctions, transitional phrases, and other natural linguistic features where appropriate. Avoid overly formal or rigid writing that lacks natural sentence flow, word order, or readability.\n\n2. Do not use code or keywords as substitutes for meaning. Explain the idea in natural language first, and then present supporting code or evidence.\n\n3. Use structured formatting to make the output clearer and easier to read. When using lists, keep each item concise whenever possible, and avoid unnecessary technical details or fully qualified class names. Use short class names or package names instead.\n\n4. When the topic or conclusion is simple, there is no need to provide extensive evidence or analysis. A brief explanation of the supporting evidence and reasoning is sufficient unless the user asks for more detail.\n\n5. Use **bold** for key conclusions, `inline code` for code entities, and a small number of important bullet points. Leave blank lines between paragraphs, and place important reasoning in its own paragraph when appropriate.\n\n6. Control information density.\n\n7. Each paragraph should focus on one main idea and should generally contain 1–4 sentences. For complex topics, prefer several short paragraphs rather than one large wall of text.",
    desktop:
      "# DexCode Desktop Context\n\n### Files & URLs\n- Return local web URLs as Markdown links (e.g., [label](http://127.0.0.1:8080)).\n- File should be an absolute path or include the workspace folder segment so it can be resolved relative to the workspace.\n- Unless otherwise specified, return local file references as Markdown links (e.g., [name.md](/absolute/path/to/name.md)).\n\n### Inline Code Comments\n- Use the ::code-comment{...} directive when you need to attach feedback directly to specific code lines.\n- Emit one directive per inline comment; emit none when there are no actionable inline comments.\n- Required attributes: title (short label), body (one-paragraph explanation), file (path to the file).\n- Optional attributes: start, end (1-based line numbers), priority (0-3).\n- file should be an absolute path or include the workspace folder segment so it can be resolved relative to the workspace.\n- Keep line ranges tight; end defaults to start.\n- Example: ::code-comment{title=\"[P2] Off-by-one\" body=\"Loop iterates past the end when length is 0.\" file=\"/path/to/foo.ts\" start=10 end=11 priority=2}",
    projectInstructions:
      "The codebase and user instructions are shown below. Please ensure that you follow these instructions.\n\n**IMPORTANT: These instructions take precedence over any default behavior, and you must follow them exactly as written. However, the output style and formatting rules must strictly comply with the default behavior.**",
  },
};

const seeds: readonly {
  id: string;
  builtin: boolean;
  zh: RolePresetFields;
  en: RolePresetFields;
}[] = [
  {
    id: "zcode-official",
    builtin: true,
    zh: {
      name: "ZCode 官方",
      author: "ZCode 官方",
      description: "专注软件工程，清晰沟通，帮助你理解问题、编写代码并完成任务。",
      expressionStylePrompt: OFFICIAL_ROLE_TEMPLATE.expressionStylePrompt,
      identityPrompt: OFFICIAL_ROLE_TEMPLATE.identityPrompt,
    },
    en: {
      name: "ZCode Official",
      author: "ZCode Official",
      description:
        "A software engineering assistant that communicates clearly and helps you understand problems, write code, and complete tasks.",
      expressionStylePrompt: OFFICIAL_ROLE_TEMPLATE.expressionStylePrompt,
      identityPrompt: OFFICIAL_ROLE_TEMPLATE.identityPrompt,
    },
  },
  {
    id: "04a923fa-2db3-4a85-b456-8ffa17ef86a1",
    builtin: false,
    zh: DEXCODE_ROLE_FIELDS,
    en: {
      ...DEXCODE_ROLE_FIELDS,
      description:
        "A more comfortable ZCode interaction style that feels like a close development partner: natural wording with structured formatting, suited to non-engineering development work and office tasks. It softens ZCode's original high-density style for a more readable experience and simplifies pre-tool-call explanations to reduce frequent fine-grained narration, for a more immersive experience.\n\nNote: the adjusted prompts may affect model and agent performance; evaluate the risks before use.",
    },
  },
];

export function getRolePresetDefinition(id: string) {
  return seeds.find((seed) => seed.id === id);
}

export function listRolePresets(overrides: RolePresetOverrides, locale: string): RolePreset[] {
  const presets = seeds.map((seed) => {
    const override = overrides[seed.id];
    const fields = !seed.builtin && override ? override : locale === "zh-CN" ? seed.zh : seed.en;
    return { id: seed.id, builtin: seed.builtin, ...fields };
  });
  return [
    ...presets,
    ...Object.entries(overrides)
      .filter(([id]) => !getRolePresetDefinition(id))
      .map(([id, fields]) => ({ id, builtin: false, ...fields })),
  ];
}

export function isRolePresetFields(value: unknown): value is RolePresetFields {
  if (!value || typeof value !== "object") return false;
  const fields = value as Partial<RolePresetFields>;
  return (
    typeof fields.name === "string" &&
    Boolean(fields.name.trim()) &&
    typeof fields.author === "string" &&
    typeof fields.description === "string" &&
    typeof fields.identityPrompt === "string" &&
    Boolean(fields.identityPrompt.trim()) &&
    typeof fields.expressionStylePrompt === "string" &&
    Boolean(fields.expressionStylePrompt.trim()) &&
    (fields.promptOverrides === undefined ||
      rolePromptOverridesSchema.safeParse(fields.promptOverrides).success)
  );
}

export function normalizeRolePresetFields(
  fields: RolePresetFields,
  trimText = true,
): RolePresetFields {
  const promptOverrides = normalizeRolePromptOverrides(fields.promptOverrides);
  const text = (value: string) => (trimText ? value.trim() : value);
  return {
    name: text(fields.name),
    author: text(fields.author),
    description: text(fields.description),
    identityPrompt: text(fields.identityPrompt),
    expressionStylePrompt: text(fields.expressionStylePrompt),
    ...(promptOverrides ? { promptOverrides } : {}),
  };
}

/** 默认选择和对话内选择共用快照解析，避免高级配置只在一个入口生效。 */
export function rolePresetToBinding(role: RolePreset): RoleBinding {
  return role.builtin
    ? { kind: "official" }
    : freezeRoleBinding({
        kind: "custom",
        roleId: role.id,
        name: role.name,
        identityPrompt: role.identityPrompt,
        expressionStylePrompt: role.expressionStylePrompt,
        ...(role.promptOverrides ? { promptOverrides: role.promptOverrides } : {}),
      });
}
