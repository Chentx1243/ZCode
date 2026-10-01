import { z } from "zod";
import { rolePromptOverridesSchema } from "./role-prompt-sections.js";

/** 官方不接收替换正文；绑定是角色内容快照，编辑角色库不会自动回写会话。 */
export const roleBindingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("official") }).strict(),
  z
    .object({
      kind: z.literal("custom"),
      roleId: z
        .string()
        .trim()
        .min(1)
        .refine((id) => id !== "zcode-official"),
      name: z.string().trim().min(1),
      identityPrompt: z.string().trim().min(1),
      expressionStylePrompt: z.string().trim().min(1),
      promptOverrides: rolePromptOverridesSchema.optional(),
    })
    .strict(),
]);
export type RoleBinding = z.infer<typeof roleBindingSchema>;

/** 解析会复制嵌套资料，冻结后不能由 UI 草稿或持久化调用方回写会话快照。 */
export function freezeRoleBinding(input: RoleBinding): RoleBinding {
  const parsed = roleBindingSchema.parse(input);
  if (parsed.kind === "custom" && parsed.promptOverrides) Object.freeze(parsed.promptOverrides);
  return Object.freeze(parsed);
}
