// ============================================================
// AI Review Stats - review 模式送审统计的聚合与持久化（bootstrap 域）
// ============================================================
// 事实源：core executor 的送审闸门与权限流程埋点（fire-and-forget）。
// 聚合：按本地日期分桶，常驻内存，懒加载合并既有持久化数据；
// 持久化：全局 local_setting（scope=global），串行写链避免并发覆盖。

import {
  buildAiReviewStatsSnapshot,
  type AiReviewStatsData,
  type AiReviewStatsSnapshot,
} from "@zcode/shared";
import type { AiReviewStatEvent, AiReviewStatsPort, LocalSettingStorePort } from "@zcode/contracts";

export interface AiReviewStatsRecorder {
  port: AiReviewStatsPort;
  /** 读取当前聚合快照（含懒加载既有持久化数据）。 */
  readSnapshot(): Promise<AiReviewStatsSnapshot>;
}

function localDateKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function emptyDay(date: string): AiReviewStatsData["days"][string] {
  return {
    date,
    reviewed: 0,
    approved: 0,
    rejected: 0,
    rejectedAllowed: 0,
    rejectedDenied: 0,
    totalReviewMs: 0,
  };
}

export function createAiReviewStatsRecorder(
  store: LocalSettingStorePort | undefined,
  options: { logger?: { warn(message: string, meta?: unknown): void } } = {},
): AiReviewStatsRecorder | undefined {
  if (!store?.getAiReviewStats || !store.saveAiReviewStats) return undefined;

  let data: AiReviewStatsData = { version: 1, days: {} };
  let loaded = false;
  let loadPromise: Promise<void> | null = null;
  let saveChain: Promise<unknown> = Promise.resolve();
  let dirty = false;

  const ensureLoaded = async (): Promise<void> => {
    if (loaded) return;
    if (!loadPromise) {
      loadPromise = (async () => {
        const stored = await store.getAiReviewStats?.();
        if (stored) data = stored;
        loaded = true;
      })();
    }
    await loadPromise;
  };

  const record = (event: AiReviewStatEvent): void => {
    void (async () => {
      try {
        await ensureLoaded();
        const key = localDateKey();
        const day = data.days[key] ?? emptyDay(key);
        switch (event.outcome) {
          case "approved":
            day.reviewed += 1;
            day.approved += 1;
            day.totalReviewMs += event.durationMs ?? 0;
            break;
          case "rejected":
            day.reviewed += 1;
            day.rejected += 1;
            day.totalReviewMs += event.durationMs ?? 0;
            break;
          case "rejectedAllowed":
            // reviewed/rejected 已在送审时计入，这里只补用户决定。
            day.rejectedAllowed += 1;
            break;
          case "rejectedDenied":
            day.rejectedDenied += 1;
            break;
        }
        data = { version: 1, days: { ...data.days, [key]: day } };
        dirty = true;
        saveChain = saveChain
          .then(() => {
            if (!dirty) return undefined;
            dirty = false;
            return store.saveAiReviewStats?.(data);
          })
          .catch((error: unknown) => {
            options.logger?.warn("AI review stats save failed", {
              errorMessage: error instanceof Error ? error.message : String(error),
              event: "ai_review_stats.save_failed",
              module: "bootstrap",
            });
          });
      } catch (error) {
        options.logger?.warn("AI review stats record failed", {
          errorMessage: error instanceof Error ? error.message : String(error),
          event: "ai_review_stats.record_failed",
          module: "bootstrap",
        });
      }
    })();
  };

  return {
    port: { recordAiReviewEvent: record },
    async readSnapshot(): Promise<AiReviewStatsSnapshot> {
      await ensureLoaded();
      return buildAiReviewStatsSnapshot(data, {
        generatedAt: Date.now(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
    },
  };
}
