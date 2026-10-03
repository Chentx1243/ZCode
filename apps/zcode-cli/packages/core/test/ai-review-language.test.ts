import test from "node:test";
import assert from "node:assert/strict";
import { MessageHistoryImpl } from "../src/agent/message-history.js";
import {
  buildAiToolReviewMessages,
  detectAiReviewLanguage,
  formatAiReviewNotice,
} from "../src/permission/ai-review.js";
import { readLatestRealUserMessageText } from "../src/runtime/methods/ai-tool-review.js";

test("语言检测：按顺序取第一个含成段中文的文本", () => {
  assert.equal(detectAiReviewLanguage("修复登录页样式问题", "english message"), "zh-CN");
  assert.equal(detectAiReviewLanguage(undefined, "帮我修复登录页"), "zh-CN");
  assert.equal(detectAiReviewLanguage("fix the login page", "then run tests"), undefined);
  assert.equal(detectAiReviewLanguage(undefined, undefined), undefined);
  assert.equal(detectAiReviewLanguage("", "   "), undefined);
});

test("语言检测：中文夹英文命令仍锚定中文，孤立汉字不锚定", () => {
  assert.equal(detectAiReviewLanguage("帮我跑一下 pnpm test，看看结果"), "zh-CN");
  assert.equal(detectAiReviewLanguage("这个 file"), undefined);
  assert.equal(detectAiReviewLanguage("I love 小米 and Xiaomi products"), undefined);
});

test("审核 prompt：语言锚点存在时显式指定简体中文", () => {
  const messages = buildAiToolReviewMessages({
    toolName: "Bash",
    input: { command: "rm -rf node_modules" },
    userLanguage: "zh-CN",
  });
  const user = messages[1]!.content;
  assert.match(user, /<user_language>Simplified Chinese<\/user_language>/);
  // 无目标会话：语言锚点独立存在，不依赖 <task> 段。
  assert.doesNotMatch(user, /<task>/);
  const system = messages[0]!.content;
  assert.match(system, /language named inside <user_language>/);
});

test("审核 prompt：无语言锚点保持原格式", () => {
  const messages = buildAiToolReviewMessages({ toolName: "Bash", input: { command: "ls" } });
  assert.doesNotMatch(messages[1]!.content, /<user_language>/);
});

test("通知文案：中文理由配中文句式", () => {
  const unrelated = formatAiReviewNotice({
    outcome: "reject",
    reasons: ["该操作与当前任务没有关联"],
    riskType: "unrelated",
  });
  assert.match(unrelated, /AI 审核拒绝了该操作（与当前任务无关）/);
  assert.match(unrelated, /该操作与当前任务没有关联/);
  assert.doesNotMatch(unrelated, /AI review rejected/);

  const harmful = formatAiReviewNotice({
    outcome: "reject",
    reasons: ["修改工作区之外的文件"],
    riskType: "harmful",
  });
  assert.match(harmful, /可能有危害/);
});

test("通知文案：英文理由保持英文句式", () => {
  const notice = formatAiReviewNotice({
    outcome: "reject",
    reasons: ["deletes files outside the workspace"],
    riskType: "harmful",
  });
  assert.match(notice, /AI review rejected this action \(potentially harmful\)/);
  assert.doesNotMatch(notice, /AI 审核/);
});

test("通知文案：unavailable 固定英文诊断串保持英文句式", () => {
  const notice = formatAiReviewNotice({
    outcome: "unavailable",
    reasons: ["AI review returned invalid JSON"],
  });
  assert.match(notice, /AI review unavailable: AI review returned invalid JSON\./);
});

test("最近真实用户消息：倒序取最新 real_user 文本", () => {
  const history = new MessageHistoryImpl();
  history.addUser("第一条中文消息", { source: "real_user" });
  history.addAssistant("已收到");
  history.addUser("最新一条中文消息", { source: "real_user" });
  assert.equal(readLatestRealUserMessageText(history), "最新一条中文消息");
});

test("最近真实用户消息：合成 user 消息不代表用户语言", () => {
  const history = new MessageHistoryImpl();
  history.addUser("todo context in english", { source: "todo_reminder" });
  assert.equal(readLatestRealUserMessageText(history), undefined);

  const mixed = new MessageHistoryImpl();
  mixed.addUser("todo context in english", { source: "todo_reminder" });
  mixed.addUser("这是用户的中文消息", { source: "real_user" });
  assert.equal(readLatestRealUserMessageText(mixed), "这是用户的中文消息");
});

test("最近真实用户消息：超长消息截断后仍可检出语言", () => {
  const history = new MessageHistoryImpl();
  const longMessage = `请帮我修复这个问题\n${"x".repeat(500)}`;
  history.addUser(longMessage, { source: "real_user" });
  const text = readLatestRealUserMessageText(history);
  assert.ok((text?.length ?? 0) <= 400);
  assert.equal(detectAiReviewLanguage(text), "zh-CN");
});
