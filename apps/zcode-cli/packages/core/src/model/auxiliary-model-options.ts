import type { Model, ModelOptions } from "@zcode/contracts";

const AUXILIARY_MAX_OUTPUT_TOKENS = 5_000;

/**
 * 辅助调用统一使用公开档位的最低项，并限制输出预算；档位顺序来自 Model Config，
 * 不能再按 disabled/off 等名字推断协议行为。
 * 角色级 temperature 不参与辅助调用：返回类型只声明本函数保证的字段，缺省时
 * adapter 边界不传该字段，由服务端默认值决定。
 */
export function auxiliaryModelOptions(
  model: Model,
): Required<Pick<ModelOptions, "reasoningLevel" | "maxOutputTokens">> {
  return {
    reasoningLevel: model.optionSpecs.reasoningLevel.values[0]!,
    maxOutputTokens: Math.min(AUXILIARY_MAX_OUTPUT_TOKENS, model.optionSpecs.maxOutputTokens.max),
  };
}
