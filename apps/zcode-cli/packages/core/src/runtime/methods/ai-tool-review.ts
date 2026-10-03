// ============================================================
// AI Tool Review - runtime 侧送审执行
// ============================================================
// 与标题生成 sidecar 同模式的一次性模型调用：必须经 runWithModelInvocationContext
// 携带完整调用上下文——尤其 refreshRuntimeHeadersBeforeAttempt。账号型（zhipu-account）
// 模型的每个请求 attempt 都要在发送前刷新运行时鉴权头，上下文缺失时 adapter 会在
// 请求前抛 ModelRequestAuthMissing（实测送审曾因此全部失败）。审核调用不发
// ModelRequest/ModelComplete 会话事件、不进对话流，属后台诊断调用。

import { runWithModelInvocationContext, traceContextToLogContext } from "../deps.js";
import type { Logger, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { createRefreshRuntimeHeadersBeforeModelAttempt } from "./model-runtime-headers.js";
import { createRuntimeModel } from "./runtime-model.js";
import { auxiliaryModelOptions } from "../../model/auxiliary-model-options.js";
import {
  buildAiToolReviewMessages,
  detectAiReviewLanguage,
  parseAiToolReviewText,
  type AiToolReviewOutcome,
  type AiToolReviewRequest,
} from "../../permission/ai-review.js";
import { modelMessageContentToText } from "@zcode/contracts";
import type { MessageHistory } from "../../agent/message-history.js";

/** 官方经验：这类一次性调用在慢链路下 15s 容易超时（标题生成已统一 60s）；
 * 审核阻塞的是权限链路，取 30s 折中。 */
const AI_TOOL_REVIEW_TIMEOUT_MS = 30_000;

/** 审核输出就是一个 JSON 判断，不需要大输出预算。 */
const AI_TOOL_REVIEW_MAX_OUTPUT_TOKENS = 1_000;

export async function runAiToolReviewViaRuntime(
  runtime: AgentRuntimeInternal,
  request: AiToolReviewRequest,
  options: { logger?: Logger; traceContext?: TraceContext },
): Promise<AiToolReviewOutcome> {
  const selection = runtime.getSessionModelSelection();
  if (!selection) {
    return { outcome: "unavailable", reasons: ["no model selected"] };
  }
  const traceContext = options.traceContext ?? runtime.rootTraceContext;
  // 任务上下文优先取会话目标原文（用户语言，相关性判断与理由语言都依赖它）；
  // goal 读取失败不阻断送审，按无上下文退化（仅安全性判断）。
  let taskContext: string | undefined;
  try {
    const goal = await runtime.readSessionTargetForContext?.(traceContext);
    if (goal?.objective) {
      taskContext = [goal.summaryTitle, goal.objective]
        .filter((part): part is string => typeof part === "string" && part.length > 0)
        .join("\n");
    }
  } catch {
    taskContext = undefined;
  }
  // 无目标的普通会话也要锚定用户语言：待审命令/路径几乎全是英文，若让模型
  // 自行退化判定，中文用户会拿到英文拒绝理由。目标未检出时回退最近真实用户消息。
  const userLanguage = detectAiReviewLanguage(
    taskContext,
    readLatestRealUserMessageText(runtime.messageHistory),
  );

  const baseModel = createRuntimeModel(runtime, { selection });
  const auxiliary = auxiliaryModelOptions(baseModel);
  const model = baseModel.bind({
    reasoningLevel: auxiliary.reasoningLevel,
    maxOutputTokens: Math.min(auxiliary.maxOutputTokens, AI_TOOL_REVIEW_MAX_OUTPUT_TOKENS),
  });

  const abortSignal = AbortSignal.timeout(AI_TOOL_REVIEW_TIMEOUT_MS);
  try {
    const result = await runWithModelInvocationContext(
      {
        metadata: traceContextToLogContext(traceContext),
        modelRequestSessionType: "other",
        modelCall: {
          operation: "ai_tool_review",
          reasoning: { requestedLevel: model.options.reasoningLevel },
        },
        refreshRuntimeHeadersBeforeAttempt: createRefreshRuntimeHeadersBeforeModelAttempt(runtime, {
          abortSignal,
          model,
          traceContext,
        }),
        traceContext,
      },
      () =>
        model.generateText({
          abortSignal,
          messages: buildAiToolReviewMessages({ ...request, taskContext, userLanguage }),
          tools: [],
        }),
    );
    const outcome = parseAiToolReviewText(result.text ?? "");
    options.logger?.debug("AI tool review completed", {
      event: "permission.ai_review.completed",
      module: "core.permission",
      outcome: outcome.outcome,
      toolName: request.toolName,
    });
    return outcome;
  } catch (error) {
    // 送审失败会升级为人工确认，有产品后果，必须生产可见。
    options.logger?.warn("AI tool review failed", {
      ...traceContextToLogContext(traceContext),
      errorMessage: error instanceof Error ? error.message : String(error),
      event: "permission.ai_review.failed",
      module: "core.permission",
      status: "failed",
      toolName: request.toolName,
    });
    return {
      outcome: "unavailable",
      reasons: ["AI review model request failed"],
    };
  }
}

/** 语言锚定只需要判断文字种类，无需整条消息。 */
const LANGUAGE_DETECTION_TEXT_LIMIT = 400;

/**
 * 倒序取最近一条真实用户消息的文本。只认 `real_user` 来源——system reminder
 * 注入的合成 user 消息（todo、goal state 等）是英文模板，不能代表用户语言。
 * 借用 entries 是同步只读操作，在返回前完成遍历，不跨异步边界持有引用。
 */
export function readLatestRealUserMessageText(history: MessageHistory): string | undefined {
  const entries = history.borrowReadOnlyRuntimeEntries();
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (entry.kind === "attachment") continue;
    if (entry.message.role !== "user" || entry.metadata?.source !== "real_user") continue;
    const text = modelMessageContentToText(entry.message.content).trim();
    return text.length > 0 ? text.slice(0, LANGUAGE_DETECTION_TEXT_LIMIT) : undefined;
  }
  return undefined;
}
