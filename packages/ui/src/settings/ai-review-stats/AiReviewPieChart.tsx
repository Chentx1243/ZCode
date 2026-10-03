// 审查情况占比：自动通过 vs 自动拒绝 的两片饼图（recharts，经 ChartContainer 封装）。
import { useCallback, useMemo } from "react";
import { Cell, Pie, PieChart } from "recharts";
import type { AiReviewStatsSnapshot } from "@zcode/shared";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { UsageEmptyState, formatCompactNumber, formatPercent } from "@/settings/usage-stats/usageStatsUiParts.js";

const AI_REVIEW_PIE_COLORS = {
  approved: "#22c55e",
  rejected: "#ef4444",
} as const;

type AiReviewPieSlice = {
  key: "approved" | "rejected";
  label: string;
  count: number;
  share: number;
  color: string;
};

const chartConfig = {
  approved: { label: "approved", color: AI_REVIEW_PIE_COLORS.approved },
  rejected: { label: "rejected", color: AI_REVIEW_PIE_COLORS.rejected },
} satisfies ChartConfig;

export function AiReviewPieChart({ snapshot }: { snapshot: AiReviewStatsSnapshot }) {
  const { intl, locale } = useZCodeIntl();

  const { chartData, totalReviewed } = useMemo(() => {
    const { approved, rejected } = snapshot.totals;
    const total = approved + rejected;
    const slices: AiReviewPieSlice[] = [
      {
        key: "approved",
        label: intl.formatMessage({ id: "settings.aiReviewStats.pie.approved" }),
        count: approved,
        share: total > 0 ? approved / total : 0,
        color: AI_REVIEW_PIE_COLORS.approved,
      },
      {
        key: "rejected",
        label: intl.formatMessage({ id: "settings.aiReviewStats.pie.rejected" }),
        count: rejected,
        share: total > 0 ? rejected / total : 0,
        color: AI_REVIEW_PIE_COLORS.rejected,
      },
    ];
    return {
      chartData: slices.filter((slice) => slice.count > 0),
      totalReviewed: total,
    };
  }, [intl, snapshot]);

  const formatTooltipItem = useCallback(
    (value: unknown, _name: unknown, item: { color?: string; payload?: unknown }) => {
      const slice = item.payload as AiReviewPieSlice | undefined;
      const count = typeof value === "number" ? value : (slice?.count ?? 0);
      return (
        <>
          <span
            className="size-2 shrink-0 self-center rounded-full"
            style={{ backgroundColor: item.color ?? slice?.color }}
          />
          <div className="grid min-w-0 flex-1 gap-1">
            <div className="truncate text-foreground-subtle">{slice?.label ?? String(_name)}</div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-baseline gap-1 text-foreground">
                <span className="font-mono font-medium tabular-nums">
                  {formatCompactNumber(locale, count)}
                </span>
              </span>
              <span className="font-mono text-foreground-subtle tabular-nums">
                {formatPercent(locale, slice?.share ?? 0)}
              </span>
            </div>
          </div>
        </>
      );
    },
    [locale],
  );
  const tooltipContent = useMemo(
    () => <ChartTooltipContent hideLabel indicator="line" formatter={formatTooltipItem} />,
    [formatTooltipItem],
  );

  return (
    <section className="space-y-3 rounded-xl bg-surface p-4">
      <h3 className="text-ui-base font-medium text-foreground">
        {intl.formatMessage({ id: "settings.aiReviewStats.pieTitle" })}
      </h3>
      {totalReviewed <= 0 ? (
        <UsageEmptyState
          title={intl.formatMessage({ id: "settings.aiReviewStats.empty" })}
          description=""
        />
      ) : (
        <div className="grid gap-4 px-3 py-3 md:grid-cols-2">
          <div className="relative mx-auto h-56 w-full max-w-64 self-center md:h-64 md:max-w-72">
            <ChartContainer config={chartConfig} className="aspect-square h-full w-full">
              <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <ChartTooltip cursor={false} content={tooltipContent} />
                <Pie
                  data={chartData}
                  dataKey="count"
                  nameKey="key"
                  innerRadius={54}
                  strokeWidth={2}
                >
                  {chartData.map((slice) => (
                    <Cell key={slice.key} fill={slice.color} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-ui-lg font-medium tabular-nums text-foreground">
                {formatCompactNumber(locale, totalReviewed)}
              </span>
              <span className="text-ui-sm text-foreground-subtle">
                {intl.formatMessage({ id: "settings.aiReviewStats.pie.centerLabel" })}
              </span>
            </div>
          </div>
          <div className="flex flex-col justify-center gap-2">
            {chartData.map((slice) => (
              <div key={slice.key} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="truncate text-ui-sm text-foreground-subtle">{slice.label}</span>
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="font-mono text-ui-sm font-medium tabular-nums text-foreground">
                    {formatCompactNumber(locale, slice.count)}
                  </span>
                  <span className="font-mono text-ui-sm text-foreground-subtle tabular-nums">
                    {formatPercent(locale, slice.share)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
