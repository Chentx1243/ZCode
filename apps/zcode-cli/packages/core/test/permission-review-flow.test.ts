import test from "node:test";
import assert from "node:assert/strict";
import type { AiReviewStatEvent, TraceContext } from "@zcode/contracts";
import { PermissionService } from "../src/permission/service.js";
import { parseAiToolReviewText } from "../src/permission/ai-review.js";
import { resolveToolPermission } from "../src/tool/executor/permission-flow.js";
import type { ToolExecutorDeps } from "../src/tool/executor/types.js";
import type { ToolEntry } from "../src/tool/types.js";
import { askUserQuestionToolEntry } from "../src/tool/handlers/ask-user-question.js";

const original = { file_path: "/w/a.txt", content: "original" };
const entry = {
  metadata: {
    name: "Write",
    readOnly: false,
    sideEffectScope: "workspace",
    riskLevel: "medium",
    needsApproval: true,
  },
  inputSchema: {
    type: "object",
    required: ["file_path", "content"],
    properties: { file_path: { type: "string" }, content: { type: "string" } },
  },
} as ToolEntry;

function harness(text: string, modifiedInput?: unknown) {
  const events: AiReviewStatEvent[] = [];
  let brokerCalls = 0;
  let reviewCalls = 0;
  const deps = {
    permissionService: new PermissionService(),
    getWorkingDirectory: () => "/w",
    getWorkspaceRoot: () => "/w",
    sessionId: "test-review",
    emitEvent: async () => {},
    executeAiToolReview: async () => {
      reviewCalls++;
      return parseAiToolReviewText(text);
    },
    aiReviewStatsPort: { recordAiReviewEvent: (event: AiReviewStatEvent) => events.push(event) },
    permissionBroker: {
      requestPermission: async () => {
        brokerCalls++;
        return modifiedInput === undefined
          ? { decision: "deny" }
          : { decision: "modify", modifiedInput };
      },
    },
  } as unknown as ToolExecutorDeps;
  const run = (input: unknown = original, tool = entry) =>
    resolveToolPermission(
      deps,
      { id: "test-review", name: tool.metadata.name, input },
      tool,
      input,
      { additionalContexts: [] },
      "review",
      { traceId: "test-review" } as TraceContext,
    );
  return { deps, events, run, counts: () => ({ brokerCalls, reviewCalls }) };
}

test("人工修改后只记忆最终输入，原始操作与其他 cwd 继续送审", async () => {
  const modified = { ...original, content: "user-approved replacement" };
  const h = harness(
    '{"decision":"reject","reasons":["unrelated"],"riskType":"unrelated"}',
    modified,
  );
  assert.equal((await h.run()).allowed, true);
  assert.equal((await h.run(modified)).allowed, true);
  assert.deepEqual(h.counts(), { brokerCalls: 1, reviewCalls: 1 });
  await h.run(original);
  assert.equal(h.counts().reviewCalls, 2);
  h.deps.getWorkingDirectory = () => "/different";
  await h.run(modified);
  assert.equal(h.counts().reviewCalls, 3);
  assert.equal(h.events[0]?.reviewedAt, h.events[1]?.reviewedAt);
});

test("无效的人工修改不能写入批准记忆", async () => {
  const h = harness('{"decision":"reject","reasons":["unsafe"],"riskType":"harmful"}', {
    file_path: "/w/a.txt",
  });
  assert.equal((await h.run()).allowed, false);
  assert.equal((await h.run()).allowed, false);
  assert.equal(h.counts().reviewCalls, 2);
});

test("格式错误的 approve 转人工确认且不计入审核结论统计", async () => {
  const h = harness('{"decision":"approve"}');
  assert.equal((await h.run()).allowed, false);
  assert.deepEqual(h.counts(), { brokerCalls: 1, reviewCalls: 1 });
  assert.equal(h.events.length, 0);
});

test("合法 AI approve 直接执行，不追加普通人工确认", async () => {
  const h = harness('{"decision":"approve","reasons":["safe"],"riskType":null}');
  assert.equal((await h.run()).allowed, true);
  assert.equal(h.counts().brokerCalls, 0);
  assert.equal(h.events[0]?.outcome, "approved");
});

test("AskUserQuestion 保持用户交互，不调用 AI 审核或记统计", async () => {
  const h = harness('{"decision":"approve","reasons":["safe"],"riskType":null}');
  const question = {
    questions: [
      {
        question: "选哪个？",
        header: "方案",
        options: [
          { label: "A", description: "方案 A" },
          { label: "B", description: "方案 B" },
        ],
      },
    ],
  };
  await h.run(question, askUserQuestionToolEntry);
  assert.deepEqual(h.counts(), { brokerCalls: 1, reviewCalls: 0 });
  assert.equal(h.events.length, 0);
});

test("AskUserQuestion 等待用户答案并正常回传，AI 批准不能代替回答", async () => {
  const question = {
    questions: [
      {
        question: "选哪个？",
        header: "方案",
        options: [
          { label: "A", description: "方案 A" },
          { label: "B", description: "方案 B" },
        ],
      },
    ],
  };
  const answered = { ...question, answers: { "选哪个？": "B" } };
  const h = harness('{"decision":"approve","reasons":["safe"],"riskType":null}');
  let entered!: () => void;
  let answer!: () => void;
  const brokerEntered = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const userAnswer = new Promise<void>((resolve) => {
    answer = resolve;
  });
  h.deps.permissionBroker.requestPermission = async () => {
    entered();
    await userAnswer;
    return { decision: "modify", modifiedInput: answered };
  };
  let settled = false;
  const pending = h.run(question, askUserQuestionToolEntry);
  void pending.then(() => {
    settled = true;
  });
  await brokerEntered;
  assert.equal(settled, false);
  assert.equal(h.counts().reviewCalls, 0);
  answer();
  const result = await pending;
  assert.equal(result.allowed, true);
  if (!result.allowed) throw new Error("Unexpected question denial");
  const output = await askUserQuestionToolEntry.handler(result.executionInput, {
    toolCallId: "test-review",
  } as never);
  assert.deepEqual(output, {
    ...answered,
    questions: answered.questions.map((question) => ({ ...question, multiSelect: false })),
  });
  assert.equal(h.events.length, 0);
});
