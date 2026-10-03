import type { PermissionDecisionResult } from "../../permission/service.js";
import {
  computeToolReviewSignature,
  formatAiReviewNotice,
  runAiToolReview,
} from "../../permission/ai-review.js";
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
): Promise<{ decision: PermissionDecisionResult; reviewSignature: string }> {
  const reviewSignature = computeToolReviewSignature(toolCall.name, executionInput);
  if (!deps.model) {
    return {
      decision: {
        ...decision,
        reason: formatAiReviewNotice({
          outcome: "unavailable",
          reasons: ["no model available"],
        }),
      },
      reviewSignature,
    };
  }

  const outcome = await runAiToolReview({
    model: deps.model,
    request: { toolName: toolCall.name, input: executionInput },
    logger: deps.logger,
  });
  if (outcome.outcome === "approve") {
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
    };
  }
  return {
    decision: { ...decision, reason: formatAiReviewNotice(outcome) },
    reviewSignature,
  };
}
