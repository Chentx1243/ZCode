import type { PermissionDecisionResult } from "../../permission/service.js";
import { computeToolReviewSignature, formatAiReviewNotice } from "../../permission/ai-review.js";
import type { ExecutableToolCall } from "../types.js";
import type { ToolExecutorDeps } from "./types.js";

/**
 * review 模式送审闸门：checkReviewMode 挂起的 pendingAiReview ask 先过 AI 审核。
 * approve 改写为 allow（ruleId mode.review.aiApproved）；reject/unavailable 维持 ask
 * 并把审核意见并入 reason，交回现有确认请求链路——审核不可用绝不静默放行。
 * 返回操作签名，调用方在用户放行后写会话记忆（同签名本会话不再送审）。
 */
export async function applyAiToolReviewGate(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  executionInput: unknown,
  decision: PermissionDecisionResult,
  traceContext?: ToolExecutorDeps["traceContext"],
): Promise<{
  decision: PermissionDecisionResult;
  reviewSignature: string;
  aiRejected: boolean;
  reviewedAt: number;
}> {
  const reviewSignature = computeToolReviewSignature(
    toolCall.name,
    executionInput,
    deps.getWorkingDirectory(),
  );
  const reviewStartedAt = Date.now();
  const reviewOutcome = deps.executeAiToolReview
    ? await deps.executeAiToolReview(
        { toolName: toolCall.name, input: executionInput },
        traceContext ? { traceContext } : undefined,
      )
    : ({
        outcome: "unavailable",
        reasons: ["ai review executor is not available"],
      } as { outcome: "unavailable"; reasons: string[] });
  // 统计口径：reviewed/approved/rejected 只记真实送审结果；unavailable（无执行器/
  // 失败/超时）不是 AI 的结论，不进通过/拒绝计数，其后的用户决定也不回填。
  if (deps.aiReviewStatsPort && reviewOutcome.outcome !== "unavailable") {
    deps.aiReviewStatsPort.recordAiReviewEvent({
      outcome: reviewOutcome.outcome === "approve" ? "approved" : "rejected",
      durationMs: Date.now() - reviewStartedAt,
      reviewedAt: reviewStartedAt,
    });
  }
  const aiRejected = reviewOutcome.outcome === "reject";
  if (reviewOutcome.outcome === "approve") {
    return {
      decision: {
        ...decision,
        decision: "allow",
        allowed: true,
        escalated: false,
        ruleId: "mode.review.aiApproved",
        reason: "Review mode: AI review approved this action",
      },
      reviewSignature,
      aiRejected,
      reviewedAt: reviewStartedAt,
    };
  }
  return {
    decision: { ...decision, reason: formatAiReviewNotice(reviewOutcome) },
    reviewSignature,
    aiRejected,
    reviewedAt: reviewStartedAt,
  };
}
