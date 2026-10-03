import { parentPort, workerData } from "node:worker_threads";
import { register } from "tsx/esm/api";

register();
const { SqliteSessionStore } = await import("@zcode/adapters/storage");

const store = new SqliteSessionStore({ dbPath: workerData.dbPath });
parentPort.postMessage("ready");
parentPort.once("message", () => {
  try {
    for (let i = 0; i < workerData.count; i++) {
      store.recordAiReviewStat({
        outcome: "approved",
        durationMs: 1,
        reviewedAt: workerData.reviewedAt,
      });
    }
    parentPort.postMessage("done");
  } finally {
    store.close();
    parentPort.close();
  }
});
