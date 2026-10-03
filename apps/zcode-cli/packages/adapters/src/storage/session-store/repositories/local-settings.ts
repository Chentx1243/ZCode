import type { DatabaseSync } from "node:sqlite";
import type {
  AiReviewStatEvent,
  CollaborationMode,
  PermissionRuleset,
  ProjectId,
} from "@zcode/contracts";
import { aiReviewStatsDataSchema, type AiReviewStatsData } from "@zcode/shared";
import { isCollaborationMode } from "../codecs.js";
import { decodeJson } from "../json.js";
import type { LocalSettingRow, PermissionRow } from "../rows.js";

export async function getProjectPermission(
  db: DatabaseSync,
  projectID: ProjectId,
): Promise<PermissionRuleset | null> {
  const setting = readLocalSetting(db, {
    key: "ruleset",
    namespace: "permission",
    scope: "project",
    scopeID: projectID,
  });
  if (setting) {
    return decodeJson<PermissionRuleset>(setting.value) ?? null;
  }

  const row = db.prepare("select * from permission where project_id = ?").get(projectID) as
    | PermissionRow
    | undefined;
  return row ? (decodeJson<PermissionRuleset>(row.data) ?? null) : null;
}

export async function saveProjectPermission(
  db: DatabaseSync,
  input: {
    projectID: ProjectId;
    permission: PermissionRuleset;
  },
): Promise<PermissionRuleset> {
  const now = Date.now();
  writeLocalSetting(db, {
    key: "ruleset",
    namespace: "permission",
    schemaVersion: 1,
    scope: "project",
    scopeID: input.projectID,
    time: now,
    value: JSON.stringify(input.permission),
  });

  const saved = await getProjectPermission(db, input.projectID);
  if (!saved) {
    throw new Error(`Project permission not found after write: ${input.projectID}`);
  }
  return saved;
}

export function getProjectPermissionMode(
  db: DatabaseSync,
  projectID: ProjectId,
): CollaborationMode | null {
  const setting = readLocalSetting(db, {
    key: "mode",
    namespace: "permission",
    scope: "project",
    scopeID: projectID,
  });
  if (!setting) return null;

  const value = decodeJson<{ mode?: unknown }>(setting.value);
  return isCollaborationMode(value?.mode) ? value.mode : null;
}

export function saveProjectPermissionMode(
  db: DatabaseSync,
  input: {
    mode: CollaborationMode;
    projectID: ProjectId;
  },
): CollaborationMode {
  const now = Date.now();
  writeLocalSetting(db, {
    key: "mode",
    namespace: "permission",
    schemaVersion: 1,
    scope: "project",
    scopeID: input.projectID,
    time: now,
    value: JSON.stringify({ mode: input.mode }),
  });
  return input.mode;
}

/** 自动审核统计桶：全局 scope，所有会话共用一份。 */
export function getAiReviewStats(db: DatabaseSync): AiReviewStatsData | undefined {
  const setting = readLocalSetting(db, {
    key: "stats",
    namespace: "aiReview",
    scope: "global",
    scopeID: "",
  });
  if (!setting) return undefined;
  const parsed = aiReviewStatsDataSchema.safeParse(decodeJson<unknown>(setting.value));
  return parsed.success ? parsed.data : undefined;
}

export function recordAiReviewStat(
  db: DatabaseSync,
  event: AiReviewStatEvent & { reviewedAt: number },
): void {
  const now = new Date(event.reviewedAt);
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid AI review timestamp");
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  // 各会话/Host 有独立连接：必须先取得数据库写锁再读取，不能合并旧内存快照。
  db.exec("BEGIN IMMEDIATE");
  try {
    const data = getAiReviewStats(db) ?? { version: 1, days: {} };
    const day = data.days[date] ?? {
      date,
      reviewed: 0,
      approved: 0,
      rejected: 0,
      rejectedAllowed: 0,
      rejectedDenied: 0,
      totalReviewMs: 0,
    };
    if (event.outcome === "approved" || event.outcome === "rejected") {
      day.reviewed += 1;
      day[event.outcome] += 1;
      day.totalReviewMs += Math.max(0, event.durationMs ?? 0);
    } else {
      day[event.outcome] += 1;
    }
    data.days[date] = day;
    writeLocalSetting(db, {
      key: "stats",
      namespace: "aiReview",
      scope: "global",
      scopeID: "",
      schemaVersion: 1,
      time: Date.now(),
      value: JSON.stringify(data),
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function readLocalSetting(
  db: DatabaseSync,
  input: {
    key: string;
    namespace: string;
    scope: string;
    scopeID: string;
  },
): LocalSettingRow | undefined {
  return db
    .prepare(
      `
      select value from local_setting
      where scope = ? and scope_id = ? and namespace = ? and key = ?
      `,
    )
    .get(input.scope, input.scopeID, input.namespace, input.key) as LocalSettingRow | undefined;
}

function writeLocalSetting(
  db: DatabaseSync,
  input: {
    key: string;
    namespace: string;
    schemaVersion: number;
    scope: string;
    scopeID: string;
    time: number;
    value: string;
  },
): void {
  db.prepare(
    `
      insert into local_setting (
        scope, scope_id, namespace, key, value, schema_version, time_created, time_updated
      ) values (?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(scope, scope_id, namespace, key) do update set
        value = excluded.value,
        schema_version = excluded.schema_version,
        time_updated = excluded.time_updated
      `,
  ).run(
    input.scope,
    input.scopeID,
    input.namespace,
    input.key,
    input.value,
    input.schemaVersion,
    input.time,
    input.time,
  );
}
