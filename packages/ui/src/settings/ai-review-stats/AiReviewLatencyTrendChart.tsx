// 平均额外耗时曲线：每条指令的送审模型调用平均耗时，按 日/周/月 聚合。
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import type { AiReviewStatsDay } from "@zcode/shared";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart.js";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  USAGE_STATS_TABS_LIST_CLASS,
  USAGE_STATS_TABS_TRIGGER_CLASS,
  UsageEmptyState,
  formatDay,
} from "@/settings/usage-stats/usageStatsUiParts.js";
import {
  buildAiReviewLatencySeries,
  type AiReviewGranularity,
} from "./aiReviewStatsViewModel.js";

const AI_REVIEW_GRANULARITIES = ["daily", "weekly", "monthly"] as const;
const LINE_COLOR = "#22c55e";

const chartConfig = {
  avgMs: { label: "avg", color: LINE_COLOR },
} satisfies ChartConfig;

function formatMsAsSeconds(locale: string, ms: number): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(ms / 1000);
}

export function AiReviewLatencyTrendChart({ days }: { days: AiReviewStatsDay[] }) {
  const { intl, locale } = useZCodeIntl();
  const [granularity, setGranularity] = useState<AiReviewGranularity>("daily");

  const series = useMemo(
    () =>
      buildAiReviewLatencySeries(days, granularity, (date) => formatDay(locale, date)),
    [days, granularity, locale],
  );

  const formatTooltipItem = (value: unknown): string =>
    `${formatMsAsSeconds(locale, typeof value === "number" ? value : Number(value) || 0)} s`;

  return (
    <section className="space-y-3 rounded-xl bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-ui-base font-medium text-foreground">
          {intl.formatMessage({ id: "settings.aiReviewStats.latencyTitle" })}
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
      {series.points.length === 0 ? (
        <UsageEmptyState
          title={intl.formatMessage({ id: "settings.aiReviewStats.empty" })}
          description=""
        />
      ) : (
        <ChartContainer config={chartConfig} className="h-56 w-full">
          <LineChart data={series.points} margin={{ top: 8, right: 24, left: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={(value: number) => formatMsAsSeconds(locale, value)}
            />
            <ChartTooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={
                <ChartTooltipContent
                  hideLabel
                  indicator="line"
                  formatter={(value) => (
                    <span className="font-mono font-medium tabular-nums text-foreground">
                      {formatTooltipItem(value)}
                    </span>
                  )}
                />
              }
            />
            <Line
              type="monotone"
              dataKey="avgMs"
              stroke={LINE_COLOR}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      )}
    </section>
  );
}
