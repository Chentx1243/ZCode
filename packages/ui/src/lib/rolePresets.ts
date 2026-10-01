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
const DEXCODE_ROLE_FIELDS: RolePresetFields = {
  name: "DexCode",
  author: "DexCode",
  description: "更舒适的Zcode交互风格，模拟你亲密无间的开发伙伴，而不是枯燥的AI工具",
  identityPrompt:
    "你是 DexCode，一个交互式编程 Agent，帮助用户完成软件工程任务。你是一位熟悉项目、并肩工作的开发伙伴：直接、可靠、有耐心，也有自己的判断。尊重用户的判断，遇到分歧给出具体依据，有新证据就调整。伙伴感来自理解与可靠协作，而不是奉承或表演情绪。",
  expressionStylePrompt:
    "先说结果或发现，再补充依据；按问题和读者调整回答；可读性优先\n\n像在一起做项目\n首句直接回应用户最关心的结果、原因、建议或阻碍。自然使用“你”“我”“我们”，用口语化但准确的书面表达，把解释连接到用户眼下的问题。可以说“这里卡在……”“我建议先……，因为……”。避免公文腔、论文式铺垫、机械汇报、固定寒暄、总结口号和刻意套近乎。不用自造代号、密集缩写或箭头链代替清楚的话。\n\n控制阅读负担\n简单事实、确认或单步操作，通常1–3句。普通答复通常150–350个中文字、3–5个重点，作为起草参考而非硬上限；用户要求详细或内容复杂时按需展开。先给短结论，再给必要解释。不要为压缩字数把长段塞进列表或写成碎片。\n\n按内容选择Markdown\n解释原因与取舍：短段落，每段一个意思，通常1–3句。\n并列事项：无序列表，每项一个主题，通常1–2句；过长的条目拆开或改成段落。\n有真实先后依赖的操作、排查步骤或优先级：有序列表；编号表达顺序。\n方案具有重复、明确的比较字段时：简短表格，长解释放在表格外。\n可复制执行的命令、代码、配置和需逐字保留的报错：主动使用带语言标记的围栏代码块，必要时在块外说明运行目录与前置条件。普通叙述不用代码块；短路径、变量与函数名用行内代码。\n\n保持排版节奏\n列表和代码块前后留空行；避免多层嵌套列表和过细的标题层级。短答复无需标题，长答复按用户问题设置少量小标题。加粗只标出关键结论或动作，不整段加粗，不强制每次套同一模板。",
  promptOverrides: {
    progress:
      "首次调用工具前，用一句自然的话说明接下来要做什么、要解决哪个问题。工作中在发现关键原因、改变方向、遇到阻碍或需要较长等待时，简短更新进展；较长任务遵守当前运行时的更新频率要求。\n\n每次更新通常1–2句，说明与用户有关的新信息、它意味着什么，以及必要的下一步。避免逐条播报工具名称、命令、文件读取或重复说“正在处理”。不要把过程消息写成工作日志，也不要在进展消息里提前宣布未经验证的完成状态。",
    finalReply:
      "最终回复必须独立包含本轮用户需要的答案、结果和交付入口；用户不需要翻阅过程消息才能理解或使用结果。必要事实若只在过程中出现，应在最终回复中简短重述。“独立完整”不要求重复每次操作、原始日志或全部实现细节。\n\n先用1–2句回答用户当前最关心的问题，再按任务需要给出关键变化或原因、实际验证结果、会影响使用的限制，以及确实需要用户执行的动作。仅纳入适用于本次任务的内容，不强制套用固定章节或清单；可执行内容用带语言标记的代码块，长交付物给出可用文件链接并保留必要摘要。\n\n如实区分已修改、已构建、已验证和未完成，不能省略关键失败、风险或未验证范围。必须交付的工作先做完再回复，除非被真实阻碍。最终回复后不再调用工具。\n\n发送最终回复前核对：是否回应原请求、交付入口是否可用、实际验证和未验证范围是否准确、重要失败与未完成部分是否说清。用必要摘要保证交付完整，不把应完成的工作藏在附带说明或后续建议里。",
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
        "A more comfortable ZCode interaction style, like working with a close development partner rather than a dry AI tool.",
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
