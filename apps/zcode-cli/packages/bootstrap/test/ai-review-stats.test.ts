import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { createAiReviewStatsRecorder } from "../src/app/ai-review-stats.js";
import { SqliteSessionStore } from "@zcode/adapters/storage";

test("两个会话及 SQLite 连接的统计增量不会覆盖，跨午夜回填保留审核日期", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "zcode-ai-review-stats-"));
  const path = join(root, "stats.db");
  const first = new SqliteSessionStore({ dbPath: path });
  const second = new SqliteSessionStore({ dbPath: path });
  const workers: Worker[] = [];
  t.after(async () => {
    await Promise.all(workers.map((worker) => worker.terminate()));
    first.close();
    second.close();
    await rm(root, { recursive: true, force: true });
  });
  const a = createAiReviewStatsRecorder(first)!;
  const b = createAiReviewStatsRecorder(second)!;
  await Promise.all([a.readSnapshot(), b.readSnapshot()]);
  const reviewedAt = new Date(2026, 9, 3, 23, 59).getTime();
  a.port.recordAiReviewEvent({ outcome: "approved", durationMs: 10, reviewedAt });
  b.port.recordAiReviewEvent({ outcome: "rejected", durationMs: 20, reviewedAt });
  b.port.recordAiReviewEvent({ outcome: "rejectedDenied", reviewedAt });
  await Promise.all([a.readSnapshot(), b.readSnapshot()]);
  const snapshot = await a.readSnapshot();
  assert.deepEqual(snapshot.totals, {
    reviewed: 2,
    approved: 1,
    rejected: 1,
    rejectedAllowed: 0,
    rejectedDenied: 1,
    totalReviewMs: 30,
  });
  assert.equal(snapshot.days.length, 1);
  assert.equal(snapshot.days[0]?.date, "2026-10-03");
  for (let i = 0; i < 20; i++) {
    a.port.recordAiReviewEvent({ outcome: "approved", durationMs: 1, reviewedAt });
    b.port.recordAiReviewEvent({ outcome: "approved", durationMs: 1, reviewedAt });
  }
  await Promise.all([a.readSnapshot(), b.readSnapshot()]);
  const restarted = createAiReviewStatsRecorder(second)!;
  assert.equal((await restarted.readSnapshot()).totals.reviewed, 42);

  // 两个独立线程同时持有真实 DB 连接，验证数据库写锁而非单线程调度的效果。
  workers.push(
    ...[0, 1].map(
      () =>
        new Worker(new URL("./fixtures/ai-review-stats-worker.mjs", import.meta.url), {
          workerData: { dbPath: path, count: 20, reviewedAt },
        }),
    ),
  );
  await Promise.all(workers.map((worker) => once(worker, "message")));
  const done = workers.map((worker) => once(worker, "message"));
  workers.forEach((worker) => worker.postMessage("start"));
  assert.deepEqual(await Promise.all(done), [["done"], ["done"]]);
  await Promise.all(workers.map((worker) => worker.terminate()));
  assert.equal((await restarted.readSnapshot()).totals.reviewed, 82);
});

test("既有 version=1 统计原样保留并增量追加", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "zcode-ai-review-legacy-"));
  const path = join(root, "stats.db");
  const store = new SqliteSessionStore({ dbPath: path });
  t.after(async () => {
    store.close();
    await rm(root, { recursive: true, force: true });
  });
  const seed = new DatabaseSync(path);
  const day = {
    date: "2026-10-01",
    reviewed: 5,
    approved: 3,
    rejected: 2,
    rejectedAllowed: 1,
    rejectedDenied: 1,
    totalReviewMs: 500,
  };
  seed
    .prepare(
      "INSERT INTO local_setting(scope, scope_id, namespace, key, value, schema_version, time_created, time_updated) VALUES ('global', '', 'aiReview', 'stats', ?, 1, 0, 0)",
    )
    .run(JSON.stringify({ version: 1, days: { [day.date]: day } }));
  seed.close();
  const recorder = createAiReviewStatsRecorder(store)!;
  recorder.port.recordAiReviewEvent({
    outcome: "approved",
    durationMs: 20,
    reviewedAt: new Date(2026, 9, 3).getTime(),
  });
  const snapshot = await recorder.readSnapshot();
  assert.deepEqual(snapshot.days[0], day);
  assert.equal(snapshot.totals.reviewed, 6);
  assert.equal(snapshot.totals.totalReviewMs, 520);
});

test("写入失败可观测且不丢后续事件，不缓存统计副本", async () => {
  let calls = 0;
  const warnings: unknown[] = [];
  const recorder = createAiReviewStatsRecorder(
    {
      getAiReviewStats: () => undefined,
      recordAiReviewStat: () => {
        if (++calls === 1) throw new Error("write failed");
      },
    } as any,
    { logger: { warn: (...args) => warnings.push(args) } },
  )!;
  recorder.port.recordAiReviewEvent({ outcome: "approved" });
  recorder.port.recordAiReviewEvent({ outcome: "approved" });
  await recorder.readSnapshot();
  assert.equal(calls, 2);
  assert.equal(warnings.length, 1);
  assert.equal((await recorder.readSnapshot()).totals.reviewed, 0);
});
