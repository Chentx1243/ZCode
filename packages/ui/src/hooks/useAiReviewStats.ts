// 自动审核统计数据 hook：走 usageStatsService 的 v4/aiReview/stats 只读查询。
import { useCallback, useEffect, useRef, useState } from "react";
import type { AiReviewStatsSnapshot } from "@zcode/shared";
import { logger } from "@/logger.js";
import { useServices } from "@/hooks/useServices.js";

interface AiReviewStatsState {
  snapshot: AiReviewStatsSnapshot | null;
  loading: boolean;
  error: string | null;
}

export function useAiReviewStats() {
  const { usageStatsService } = useServices();
  const [state, setState] = useState<AiReviewStatsState>({
    snapshot: null,
    loading: false,
    error: null,
  });
  const requestVersionRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    setState((current) => ({ snapshot: current.snapshot, loading: true, error: null }));
    try {
      const snapshot = await usageStatsService.getAiReviewStatsSnapshot();
      if (requestVersionRef.current !== requestVersion) return;
      setState({ snapshot, loading: false, error: null });
    } catch (error) {
      if (requestVersionRef.current !== requestVersion) return;
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("[useAiReviewStats] 读取自动审核统计失败", { error: message });
      setState((current) => ({ snapshot: current.snapshot, loading: false, error: message }));
    }
  }, [usageStatsService]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
