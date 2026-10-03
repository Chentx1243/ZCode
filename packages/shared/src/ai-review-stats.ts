import { z } from "zod";

// ── 自动审核统计（review 模式送审结果的全局聚合）────────────────
// 事实源：bootstrap 侧送审埋点，落在全局 session 库 local_setting（scope=global）。
// 口径（与设置页"自动批准统计"对齐）：
// - reviewed  = 累计审查指令数（经过 AI 审核的全部指令，含放行与拦截）
// - approved  = 自动通过（AI 结论通过、直接执行）
// - rejected  = 自动拒绝（AI 结论不通过，转人工确认）
// - rejectedAllowed = AI 拒绝后用户在确认窗放行
// - rejectedDenied  = AI 拒绝后用户也拒绝（有效拦截）
// - totalReviewMs   = 送审模型调用耗时累计（不含用户等待）

export const aiReviewStatsDaySchema = z.object({
  /** 本地日期 YYYY-MM-DD。 */
  date: z.string(),
  reviewed: z.number().int().nonnegative(),
  approved: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  rejectedAllowed: z.number().int().nonnegative(),
  rejectedDenied: z.number().int().nonnegative(),
  totalReviewMs: z.number().nonnegative(),
});
export type AiReviewStatsDay = z.infer<typeof aiReviewStatsDaySchema>;

/** local_setting 里的持久化形态：按日期 key 的稀疏桶。 */
export const aiReviewStatsDataSchema = z.object({
  version: z.literal(1),
  days: z.record(z.string(), aiReviewStatsDaySchema),
});
export type AiReviewStatsData = z.infer<typeof aiReviewStatsDataSchema>;

export const aiReviewStatsTotalsSchema = aiReviewStatsDaySchema.omit({ date: true });
export type AiReviewStatsTotals = z.infer<typeof aiReviewStatsTotalsSchema>;

export const aiReviewStatsSnapshotSchema = z.object({
  generatedAt: z.number(),
  timeZone: z.string(),
  totals: aiReviewStatsTotalsSchema,
  /** 按 date 升序。 */
  days: z.array(aiReviewStatsDaySchema),
});
export type AiReviewStatsSnapshot = z.infer<typeof aiReviewStatsSnapshotSchema>;

export function emptyAiReviewStatsTotals(): AiReviewStatsTotals {
  return {
    reviewed: 0,
    approved: 0,
    rejected: 0,
    rejectedAllowed: 0,
    rejectedDenied: 0,
    totalReviewMs: 0,
  };
}

/** 把稀疏日桶聚合成快照；days 升序、totals 全量求和。 */
export function buildAiReviewStatsSnapshot(
  data: AiReviewStatsData | undefined,
  options: { generatedAt: number; timeZone: string },
): AiReviewStatsSnapshot {
  const days = Object.values(data?.days ?? {}).sort((a, b) => (a.date < b.date ? -1 : 1));
  const totals = days.reduce<AiReviewStatsTotals>((acc, day) => {
    acc.reviewed += day.reviewed;
    acc.approved += day.approved;
    acc.rejected += day.rejected;
    acc.rejectedAllowed += day.rejectedAllowed;
    acc.rejectedDenied += day.rejectedDenied;
    acc.totalReviewMs += day.totalReviewMs;
    return acc;
  }, emptyAiReviewStatsTotals());
  return {
    generatedAt: options.generatedAt,
    timeZone: options.timeZone,
    totals,
    days,
  };
}
