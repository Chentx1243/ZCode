// 自动审核活动热力图：复用 UsageHeatmapCells 的列/格原语与配色，
// 支持每日（52 周日粒度网格）/每周（列填充）/每月（月聚合色块）三种粒度。
import { useState } from "react";
import type { AiReviewStatsDay } from "@zcode/shared";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  HeatmapColumn,
  type HeatmapDisplayColumn,
} from "@/settings/usage-stats/UsageHeatmapCells.js";
import {
  USAGE_STATS_TABS_LIST_CLASS,
  USAGE_STATS_TABS_TRIGGER_CLASS,
  formatCompactNumber,
  formatFullDay,
  formatMonth,
} from "@/settings/usage-stats/usageStatsUiParts.js";
import {
  buildAiReviewHeatmapColumns,
  buildDenseDayGrid,
  type AiReviewGranularity,
  type AiReviewHeatmapDisplayColumn,
} from "./aiReviewStatsViewModel.js";

const AI_REVIEW_GRANULARITIES = ["daily", "weekly", "monthly"] as const;

function toHeatmapColumn(column: AiReviewHeatmapDisplayColumn): HeatmapDisplayColumn {
  return {
    key: column.key,
    monthDate: column.monthDate,
    tooltipTitle: column.tooltipTitle,
    cells: column.cells.map((cell) => ({
      key: cell.key,
      level: cell.level,
      hasUsage: cell.hasValue,
      columnHover: cell.columnHover,
      tooltipTitle: cell.tooltipTitle,
    })),
  };
}

export function AiReviewHeatmap({ days }: { days: AiReviewStatsDay[] }) {
  const { intl, locale } = useZCodeIntl();
  const [granularity, setGranularity] = useState<AiReviewGranularity>("daily");

  const texts = {
    cell: (date: string, count: number) =>
      intl.formatMessage({ id: "settings.aiReviewStats.heatmap.cell" }, {
        date: formatFullDay(locale, date),
        count: formatCompactNumber(locale, count),
      }),
    week: (date: string, count: number) =>
      intl.formatMessage({ id: "settings.aiReviewStats.heatmap.week" }, {
        date: formatFullDay(locale, date),
        count: formatCompactNumber(locale, count),
      }),
    month: (label: string, count: number) =>
      intl.formatMessage({ id: "settings.aiReviewStats.heatmap.month" }, {
        month: label,
        count: formatCompactNumber(locale, count),
      }),
  };

  const grid = buildDenseDayGrid(days);
  const { columns, monthLabels, gridTemplateColumns } = buildAiReviewHeatmapColumns(
    grid,
    granularity,
    texts,
    (date) => formatMonth(locale, date),
  );

  return (
    <section className="space-y-3 rounded-xl bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-ui-base font-medium text-foreground">
          {intl.formatMessage({ id: "settings.aiReviewStats.heatmapTitle" })}
        </h3>
        <Tabs
          value={granularity}
          onValueChange={(value) => setGranularity(value as AiReviewGranularity)}
          className="shrink-0"
        >
          <TabsList className={USAGE_STATS_TABS_LIST_CLASS}>
            {AI_REVIEW_GRANULARITIES.map((option) => (
              <TabsTrigger
                key={option}
                value={option}
                onClick={() => setGranularity(option)}
                className={USAGE_STATS_TABS_TRIGGER_CLASS}
              >
                {intl.formatMessage({ id: `settings.aiReviewStats.range.${option}` })}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      {columns.length === 0 ? (
        <div className="py-6 text-center text-ui-sm text-foreground-subtle">
          {intl.formatMessage({ id: "settings.aiReviewStats.empty" })}
        </div>
      ) : (
        <div>
          <div className="grid w-full gap-x-0.5" style={{ gridTemplateColumns }}>
            {columns.map((column) => (
              <HeatmapColumn
                key={column.key}
                column={toHeatmapColumn(column)}
                mode={granularity === "daily" ? "daily" : "weekly"}
              />
            ))}
          </div>
          <div className="mt-3 grid w-full gap-x-0.5" style={{ gridTemplateColumns }}>
            {monthLabels.map((label) => (
              <div
                key={label.key}
                data-usage-heatmap-month-label
                className="min-w-0 truncate text-ui-sm text-foreground-subtle"
                style={{ gridColumn: `span ${label.span}` }}
              >
                {label.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
