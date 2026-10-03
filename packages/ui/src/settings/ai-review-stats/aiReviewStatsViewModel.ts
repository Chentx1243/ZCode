// 自动审核统计的视图模型：日桶 → 热力图列/周/月聚合/耗时序列。
// 网格对齐逻辑（52 周周日起步）与 UsageHeatmap 保持同一套公式，保证两类看板视觉一致。
import type { AiReviewStatsDay, AiReviewStatsSnapshot } from "@zcode/shared";

const DAY_MS = 86_400_000;
const DAYS_PER_WEEK = 7;
const DISPLAY_WEEK_COUNT = 52;

export type AiReviewGranularity = "daily" | "weekly" | "monthly";

/** 热力图粒度与使用统计三档一致：每日/每周/累计。 */
export type AiReviewHeatmapGranularity = "daily" | "weekly" | "cumulative";

export interface AiReviewHeatmapDisplayColumn {
  key: string;
  monthDate: string;
  tooltipTitle: string | null;
  cells: {
    key: string;
    level: 0 | 1 | 2 | 3 | 4;
    hasValue: boolean;
    columnHover: boolean;
    tooltipTitle?: string;
  }[];
}

export interface AiReviewLatencyPoint {
  key: string;
  label: string;
  tooltipLabel: string;
  avgMs: number;
}

function dateKeyToUtcDayIndex(dateKey: string): number | null {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : Math.floor(date.getTime() / DAY_MS);
}

function getUtcWeekday(dayIndex: number): number {
  return new Date(dayIndex * DAY_MS).getUTCDay();
}

function utcDayIndexToDateKey(dayIndex: number): string {
  return new Date(dayIndex * DAY_MS).toISOString().slice(0, 10);
}

function levelForValue(value: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((value / max) * 4))) as 0 | 1 | 2 | 3 | 4;
}

/** 把稀疏日桶铺满 52 周网格（缺失补 0，列按自然周对齐、首行为周日）。 */
function buildDenseDays(days: AiReviewStatsDay[]): Map<string, AiReviewStatsDay> {
  return new Map(days.map((day) => [day.date, day]));
}

export function buildDenseDayGrid(
  days: AiReviewStatsDay[],
): { date: string; reviewed: number }[][] {
  const byDate = buildDenseDays(days);
  const datedIndexes = days
    .map((day) => dateKeyToUtcDayIndex(day.date))
    .filter((index): index is number => index !== null);
  if (datedIndexes.length === 0) return [];

  const endDayIndex = Math.max(...datedIndexes);
  const endWeekStartDayIndex = endDayIndex - getUtcWeekday(endDayIndex);
  const startDayIndex = endWeekStartDayIndex - (DISPLAY_WEEK_COUNT - 1) * DAYS_PER_WEEK;

  return Array.from({ length: DISPLAY_WEEK_COUNT }, (_, weekIndex) =>
    Array.from({ length: DAYS_PER_WEEK }, (_, dayOffset) => {
      const dayIndex = startDayIndex + weekIndex * DAYS_PER_WEEK + dayOffset;
      const date = utcDayIndexToDateKey(dayIndex);
      return { date, reviewed: byDate.get(date)?.reviewed ?? 0 };
    }),
  );
}

export interface HeatmapTexts {
  cell: (date: string, count: number) => string;
  week: (date: string, count: number) => string;
  cumulative: (date: string, count: number) => string;
}

function resolveColumnMonthDate(days: { date: string }[]): string {
  const firstDayOfMonth = days.find((cell) => cell.date.endsWith("-01"));
  return firstDayOfMonth?.date ?? days[0]?.date ?? "";
}

export function buildAiReviewHeatmapColumns(
  grid: { date: string; reviewed: number }[][],
  granularity: AiReviewHeatmapGranularity,
  texts: HeatmapTexts,
  formatMonth: (date: string) => string,
): {
  columns: AiReviewHeatmapDisplayColumn[];
  monthLabels: { key: string; label: string; span: number }[];
  gridTemplateColumns: string;
} {
  // 周/累计视图共用使用统计的"列填充"样式：保持 52 周细密列网格；每周列值为该周
  // 总量（weekly）或自起始周到该周的累计总量（cumulative，逐周前缀和），
  // 格子自下而上按占最大值的比例填充。
  const weekTotals = grid.map((week) => week.reduce((sum, day) => sum + day.reviewed, 0));
  const aggregateValues =
    granularity === "cumulative"
      ? weekTotals.reduce<number[]>((acc, total) => {
          acc.push((acc.at(-1) ?? 0) + total);
          return acc;
        }, [])
      : weekTotals;
  const aggregateMax = Math.max(0, ...aggregateValues);

  const columns =
    granularity === "daily"
      ? grid.map((week, weekIndex) => ({
          key: `daily-${weekIndex}`,
          monthDate: resolveColumnMonthDate(week),
          tooltipTitle: null,
          cells: week.map((day) => {
            const level = levelForValue(day.reviewed, aggregateMax);
            return {
              key: `daily-${day.date}`,
              level,
              hasValue: day.reviewed > 0,
              columnHover: false,
              tooltipTitle: day.reviewed > 0 ? texts.cell(day.date, day.reviewed) : undefined,
            };
          }),
        }))
      : grid.map((week, weekIndex) => {
          const total = aggregateValues[weekIndex] ?? 0;
          const level = levelForValue(total, aggregateMax);
          const weekEndDate = week[6]?.date ?? "";
          const tooltipTitle =
            total > 0
              ? granularity === "cumulative"
                ? texts.cumulative(weekEndDate, total)
                : texts.week(weekEndDate, total)
              : null;
          return {
            key: `${granularity}-${weekIndex}`,
            monthDate: resolveColumnMonthDate(week) || weekEndDate,
            tooltipTitle,
            cells: week.map((day, dayOffset) => {
              // 周/累计视图：等级填充自下而上，格数与聚合量占最大值的比例一致。
              const filledRows =
                total <= 0
                  ? 0
                  : Math.min(
                      DAYS_PER_WEEK,
                      Math.max(1, Math.ceil((total / Math.max(1, aggregateMax)) * DAYS_PER_WEEK)),
                    );
              const isFilled = dayOffset >= DAYS_PER_WEEK - filledRows;
              return {
                key: `${granularity}-${day.date}`,
                level: isFilled ? level : (0 as const),
                hasValue: isFilled && total > 0,
                columnHover: true,
              };
            }),
          };
        });

  const monthLabels: { key: string; label: string; span: number }[] = [];
  for (const column of columns) {
    const monthKey = column.monthDate.slice(0, 7);
    const last = monthLabels.at(-1);
    if (last?.key === monthKey) {
      last.span += 1;
    } else {
      monthLabels.push({ key: monthKey, label: formatMonth(column.monthDate), span: 1 });
    }
  }

  return {
    columns,
    monthLabels,
    gridTemplateColumns: `repeat(${DISPLAY_WEEK_COUNT}, minmax(0, 1fr))`,
  };
}

export interface AiReviewLatencySeries {
  points: AiReviewLatencyPoint[];
}

function bucketKeyForDate(date: string, granularity: AiReviewGranularity): string {
  if (granularity === "daily") return date;
  if (granularity === "monthly") return date.slice(0, 7);
  // ISO 周：以周一为起点。用 UTC 周四所在年避免跨年周错位。
  const dayIndex = dateKeyToUtcDayIndex(date) ?? 0;
  const weekday = getUtcWeekday(dayIndex);
  const mondayIndex = dayIndex - ((weekday + 6) % 7);
  return utcDayIndexToDateKey(mondayIndex);
}

/** 平均额外耗时序列：桶内 totalReviewMs/reviewed，无审查的桶不产生点。 */
export function buildAiReviewLatencySeries(
  days: AiReviewStatsDay[],
  granularity: AiReviewGranularity,
  formatLabel: (date: string) => string,
): AiReviewLatencySeries {
  const buckets = new Map<string, { reviewed: number; totalReviewMs: number; anchor: string }>();
  for (const day of days) {
    const key = bucketKeyForDate(day.date, granularity);
    const entry = buckets.get(key) ?? { reviewed: 0, totalReviewMs: 0, anchor: day.date };
    entry.reviewed += day.reviewed;
    entry.totalReviewMs += day.totalReviewMs;
    buckets.set(key, entry);
  }
  const points = [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .filter(([, entry]) => entry.reviewed > 0)
    .map(([key, entry]) => ({
      key,
      label: formatLabel(entry.anchor),
      tooltipLabel: formatLabel(entry.anchor),
      avgMs: entry.totalReviewMs / entry.reviewed,
    }));
  return { points };
}

/** 看板顶部五指标。 */
export function buildAiReviewSummary(snapshot: AiReviewStatsSnapshot): {
  reviewed: number;
  approved: number;
  rejected: number;
  interceptRate: number | null;
  avgExtraMs: number | null;
} {
  const { reviewed, approved, rejected, rejectedDenied, totalReviewMs } = snapshot.totals;
  return {
    reviewed,
    approved,
    rejected,
    interceptRate: rejected > 0 ? rejectedDenied / rejected : null,
    avgExtraMs: reviewed > 0 ? totalReviewMs / reviewed : null,
  };
}
