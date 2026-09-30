import { z } from "zod";

/** 官方不接收替换正文；绑定是角色内容快照，编辑角色库不会自动回写会话。 */
export const roleBindingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("official") }).strict(),
  z
    .object({
      kind: z.literal("custom"),
      roleId: z.string().trim().min(1),
      name: z.string().trim().min(1),
      identityPrompt: z.string().trim().min(1),
      expressionStylePrompt: z.string().trim().min(1),
    })
    .strict(),
]);
export type RoleBinding = z.infer<typeof roleBindingSchema>;
