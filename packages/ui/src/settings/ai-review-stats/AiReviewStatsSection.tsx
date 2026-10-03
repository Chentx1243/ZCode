// 设置页"自动批准统计"分区：顶部指标条 + 审查活动热力图 + 占比饼图 + 耗时曲线。
// 排版与"使用统计"（AppUsagePanel）一致；图表经 lazy 边界按需加载（recharts 初始化隔离）。
import { lazy, Suspense } from "react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAiReviewStats } from "@/hooks/useAiReviewStats.js";
import { UsageStatsErrorNotice } from "@/settings/usage-stats/UsageStatsErrorNotice.js";
import {
  UsageEmptyState,
  formatCompactNumber,
  formatPercent,
} from "@/settings/usage-stats/usageStatsUiParts.js";
import { buildAiReviewSummary } from "./aiReviewStatsViewModel.js";
import { AiReviewHeatmap } from "./AiReviewHeatmap.js";

// 与 usage 面板同款：recharts 只在打开本分区时加载，图表自身的加载失败由边界兜底。
const AiReviewPieChart = lazy(() =>
  import("./AiReviewPieChart.js").then((module) => ({ default: module.AiReviewPieChart })),
);
const AiReviewLatencyTrendChart = lazy(() =>
  import("./AiReviewLatencyTrendChart.js").then((module) => ({
    default: module.AiReviewLatencyTrendChart,
  })),
);

function SummaryMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="truncate text-ui-sm text-foreground-subtle">{label}</div>
      <div className="mt-1 truncate font-mono text-ui-lg font-medium tabular-nums text-foreground">
        {value}
      </div>
      {hint ? (
        <div className="mt-0.5 text-ui-sm text-foreground-subtle" title={hint}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export function AiReviewStatsSection() {
  const { intl, locale } = useZCodeIntl();
  const { snapshot, loading, error } = useAiReviewStats();

  if (loading && !snapshot) {
    return (
      <UsageEmptyState
        title={intl.formatMessage({ id: "settings.usage.loadingTitle" })}
        description=""
      />
    );
  }

  if (!snapshot) {
    return (
      <div className="space-y-5">
        {error ? <UsageStatsErrorNotice error={error} /> : null}
        <UsageEmptyState
          title={intl.formatMessage({ id: "settings.aiReviewStats.empty" })}
          description=""
        />
      </div>
    );
  }

  const summary = buildAiReviewSummary(snapshot);

  return (
    <div className="space-y-5">
      <section className="rounded-xl bg-surface p-4">
        <div className="flex flex-wrap items-start gap-6">
          <SummaryMetric
            label={intl.formatMessage({ id: "settings.aiReviewStats.summary.reviewed" })}
            value={formatCompactNumber(locale, summary.reviewed)}
          />
          <SummaryMetric
            label={intl.formatMessage({ id: "settings.aiReviewStats.summary.approved" })}
            value={formatCompactNumber(locale, summary.approved)}
          />
          <SummaryMetric
            label={intl.formatMessage({ id: "settings.aiReviewStats.summary.rejected" })}
            value={formatCompactNumber(locale, summary.rejected)}
          />
          <SummaryMetric
            label={intl.formatMessage({ id: "settings.aiReviewStats.summary.interceptRate" })}
            value={
              summary.interceptRate === null
                ? "—"
                : formatPercent(locale, summary.interceptRate)
            }
            hint={
              summary.rejected > 0
                ? intl.formatMessage(
                    { id: "settings.aiReviewStats.summary.interceptRateHint" },
                    {
                      denied: formatCompactNumber(locale, snapshot.totals.rejectedDenied),
                      rejected: formatCompactNumber(locale, summary.rejected),
                    },
                  )
                : undefined
            }
          />
          <SummaryMetric
            label={intl.formatMessage({ id: "settings.aiReviewStats.summary.avgExtraTime" })}
            value={
              summary.avgExtraMs === null
                ? "—"
                : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(summary.avgExtraMs / 1000)} s`
            }
          />
        </div>
      </section>
      <AiReviewHeatmap days={snapshot.days} />
      <Suspense fallback={null}>
        <AiReviewPieChart snapshot={snapshot} />
      </Suspense>
      <Suspense fallback={null}>
        <AiReviewLatencyTrendChart days={snapshot.days} />
      </Suspense>
    </div>
  );
}
