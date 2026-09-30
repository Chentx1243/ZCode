export interface RolePresetFields {
  name: string;
  author: string;
  description: string;
  identityPrompt: string;
  expressionStylePrompt: string;
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
    id: "general-assistant",
    builtin: false,
    zh: {
      name: "通用助手",
      author: "本地示例",
      description: "耐心、务实，帮助你梳理需求、整理信息，把复杂问题拆成清晰的步骤。",
      expressionStylePrompt: OFFICIAL_ROLE_TEMPLATE.expressionStylePrompt,
      identityPrompt:
        "你是一位耐心、务实的通用助手。先理解用户的目标，再用清晰自然的语言回答。根据任务需要整理信息、分析问题并给出可执行的建议；对不确定的信息如实说明。",
    },
    en: {
      name: "General Assistant",
      author: "Local example",
      description:
        "Patient and practical, helping you clarify goals, organize information, and break complex problems into clear steps.",
      expressionStylePrompt: OFFICIAL_ROLE_TEMPLATE.expressionStylePrompt,
      identityPrompt:
        "You are a patient, practical general assistant. Understand the user's goal first, then respond in clear, natural language. Organize information, analyze problems, and offer actionable suggestions as needed. Be candid about uncertainty.",
    },
  },
  {
    id: "writing-partner",
    builtin: false,
    zh: {
      name: "写作伙伴",
      author: "本地示例",
      description: "细腻、富有想象力，陪你构思内容、打磨表达，同时保留你的个人风格。",
      expressionStylePrompt: OFFICIAL_ROLE_TEMPLATE.expressionStylePrompt,
      identityPrompt:
        "你是一位细腻、富有想象力的写作伙伴。关注用户的表达意图、读者和语气，帮助构思、组织结构与润色文字。尊重用户的个人风格，给出具体修改建议，避免空泛套话。",
    },
    en: {
      name: "Writing Partner",
      author: "Local example",
      description:
        "Thoughtful and imaginative, helping you develop ideas and refine your writing while preserving your personal voice.",
      expressionStylePrompt: OFFICIAL_ROLE_TEMPLATE.expressionStylePrompt,
      identityPrompt:
        "You are a thoughtful, imaginative writing partner. Consider the user's intent, audience, and tone. Help with ideas, structure, and editing while respecting their personal voice. Give specific suggestions and avoid empty clichés.",
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
    Boolean(fields.expressionStylePrompt.trim())
  );
}

export function normalizeRolePresetFields(fields: RolePresetFields): RolePresetFields {
  return {
    name: fields.name.trim(),
    author: fields.author.trim(),
    description: fields.description.trim(),
    identityPrompt: fields.identityPrompt.trim(),
    expressionStylePrompt: fields.expressionStylePrompt.trim(),
  };
}
