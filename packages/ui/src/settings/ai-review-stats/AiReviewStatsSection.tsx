// 设置页"自动批准统计"分区：顶部指标条 + 审查活动热力图 + 占比饼图 + 耗时曲线。
// 指标条排版与"使用统计"的 AppUsageLifetimeSummaryStrip 一致（数值在上、描述在下、
// 竖分隔线条形布局）；拦截率与额外耗时带小问号悬浮说明数据口径。
import { Fragment, lazy, Suspense } from "react";
import { HelpCircle } from "lucide-react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
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
  tooltipId,
  intl,
}: {
  label: string;
  value: string;
  tooltipId?: string;
  intl: ReturnType<typeof useZCodeIntl>["intl"];
}) {
  const labelNode = (
    <div className="mt-1 flex min-w-0 items-center justify-center gap-1 text-ui-base text-foreground-subtle">
      <span className="truncate">{label}</span>
      {tooltipId ? (
        <ControlHintTooltip title={intl.formatMessage({ id: tooltipId })}>
          <HelpCircle
            aria-hidden="true"
            className="size-3.5 shrink-0 cursor-help text-foreground-subtle hover:text-foreground"
          />
        </ControlHintTooltip>
      ) : null}
    </div>
  );
  return (
    <div className="min-w-0 flex-1 px-4 py-3 text-center">
      <div className="truncate text-ui-lg font-medium text-foreground">{value}</div>
      {labelNode}
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
  const items = [
    {
      label: intl.formatMessage({ id: "settings.aiReviewStats.summary.reviewed" }),
      value: `${formatCompactNumber(locale, summary.reviewed)} ${intl.formatMessage({ id: "settings.aiReviewStats.unit.count" })}`,
    },
    {
      label: intl.formatMessage({ id: "settings.aiReviewStats.summary.approved" }),
      value: `${formatCompactNumber(locale, summary.approved)} ${intl.formatMessage({ id: "settings.aiReviewStats.unit.count" })}`,
    },
    {
      label: intl.formatMessage({ id: "settings.aiReviewStats.summary.rejected" }),
      value: `${formatCompactNumber(locale, summary.rejected)} ${intl.formatMessage({ id: "settings.aiReviewStats.unit.count" })}`,
    },
    {
      label: intl.formatMessage({ id: "settings.aiReviewStats.summary.interceptRate" }),
      value:
        summary.interceptRate === null ? "--" : `${formatPercent(locale, summary.interceptRate)}`,
      tooltipId: "settings.aiReviewStats.summary.interceptRateTooltip",
    },
    {
      label: intl.formatMessage({ id: "settings.aiReviewStats.summary.avgExtraTime" }),
      value:
        summary.avgExtraMs === null
          ? "--"
          : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(summary.avgExtraMs / 1000)} ${intl.formatMessage({ id: "settings.aiReviewStats.unit.seconds" })}`,
      tooltipId: "settings.aiReviewStats.summary.avgExtraTimeTooltip",
    },
  ];

  return (
    <div className="space-y-5">
      <section className="flex flex-col overflow-hidden rounded-xl bg-surface sm:flex-row sm:items-center">
        {items.map((item, index) => (
          <Fragment key={item.label}>
            {index > 0 ? (
              <div aria-hidden="true" className="hidden h-7 w-px bg-border sm:block" />
            ) : null}
            <SummaryMetric
              label={item.label}
              value={item.value}
              tooltipId={item.tooltipId}
              intl={intl}
            />
          </Fragment>
        ))}
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
