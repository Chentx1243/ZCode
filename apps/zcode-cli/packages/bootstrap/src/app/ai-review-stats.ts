// 审核统计事实由存储层原子聚合；bootstrap 只调度写入，不保留全局数据副本。
import { buildAiReviewStatsSnapshot, type AiReviewStatsSnapshot } from "@zcode/shared";
import type { AiReviewStatsPort, LocalSettingStorePort } from "@zcode/contracts";

export interface AiReviewStatsRecorder {
  port: AiReviewStatsPort;
  readSnapshot(): Promise<AiReviewStatsSnapshot>;
}

export function createAiReviewStatsRecorder(
  store: LocalSettingStorePort | undefined,
  options: { logger?: { warn(message: string, meta?: unknown): void } } = {},
): AiReviewStatsRecorder | undefined {
  if (!store?.getAiReviewStats || !store.recordAiReviewStat) return undefined;
  const record = store.recordAiReviewStat.bind(store);
  const read = store.getAiReviewStats.bind(store);
  let writeChain: Promise<void> = Promise.resolve();
  return {
    port: {
      recordAiReviewEvent(event): void {
        const accepted = { ...event, reviewedAt: event.reviewedAt ?? Date.now() };
        // 旧代码按会话缓存全局快照，另一会话会覆盖它；这里只提交原子增量。
        writeChain = writeChain
          .then(() => record(accepted))
          .catch((error: unknown) => {
            options.logger?.warn("AI review stats save failed", {
              errorMessage: error instanceof Error ? error.message : String(error),
              event: "ai_review_stats.save_failed",
              module: "bootstrap",
            });
          });
      },
    },
    async readSnapshot() {
      await writeChain;
      return buildAiReviewStatsSnapshot(await read(), {
        generatedAt: Date.now(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
    },
  };
}
