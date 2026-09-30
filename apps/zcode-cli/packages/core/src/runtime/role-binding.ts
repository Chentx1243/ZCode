import { roleBindingSchema, type RoleBinding } from "@zcode/shared";
import type { SessionEntryInfo, SessionId, SessionStorePort } from "@zcode/contracts";
import type { AgentRuntimeInternal } from "./internal.js";
import { rebuildContextPrefix } from "./methods/context-refresh.js";
import { SessionEventType } from "./deps.js";

export const ROLE_BINDING_ENTRY = "runtime/role_binding";
export function buildRoleBindingEntry(
  sessionId: SessionId,
  binding: RoleBinding,
): SessionEntryInfo {
  const timestamp = Date.now();
  return {
    id: `${sessionId}:role-binding`,
    sessionID: sessionId,
    type: ROLE_BINDING_ENTRY,
    touchSession: false,
    time: { created: timestamp, updated: timestamp },
    data: binding,
  };
}
export function getRoleBinding(this: AgentRuntimeInternal): RoleBinding {
  return this.config.roleBinding ? { ...this.config.roleBinding } : { kind: "official" };
}
export function bindInitialRole(this: AgentRuntimeInternal, binding: RoleBinding): void {
  // 角色只在创建阶段固定，不能通过初始化入口修改已经运行或恢复的会话。
  if (this.sessionPersisted || this.turnNumber > 0 || this.hasActiveOrQueuedTurnWork()) {
    throw new Error("Role can only be bound to a new, idle session");
  }
  const parsed = roleBindingSchema.parse(binding);
  if (parsed.kind === "custom" && (this.config.systemPrompt?.trim() || this.config.workflowActor)) {
    throw new Error("Role binding conflicts with custom system prompt or workflow actor");
  }
  this.config.roleBinding = Object.freeze(parsed);
  rebuildContextPrefix(this);
}

export async function switchRoleBinding(
  this: AgentRuntimeInternal,
  binding: RoleBinding,
  traceContext: import("@zcode/contracts").TraceContext,
): Promise<void> {
  if (this.hasActiveOrQueuedTurnWork() || this.roleBindingMutationInProgress) {
    throw new Error("Role cannot be changed while the session has active or queued turn work");
  }
  const parsed = roleBindingSchema.parse(binding);
  if (parsed.kind === "custom" && (this.config.systemPrompt?.trim() || this.config.workflowActor)) {
    throw new Error("Role binding conflicts with custom system prompt or workflow actor");
  }
  const previous = this.getRoleBinding();
  if (JSON.stringify(previous) === JSON.stringify(parsed)) return;
  const sessionStore = this.sessionStore;
  if (!sessionStore?.saveSessionEntry) {
    throw new Error("Session role persistence is unavailable");
  }

  this.roleBindingMutationInProgress = true;
  try {
    // 先持久化快照再改运行配置；存储失败时维持旧身份和旧上下文。
    await sessionStore.saveSessionEntry(buildRoleBindingEntry(this.sessionId, parsed));
    this.config.roleBinding = Object.freeze(parsed);
    rebuildContextPrefix(this);
    await this.appendEvent(
      this.createEvent(SessionEventType.RoleBindingChanged, { roleBinding: parsed }, traceContext),
      traceContext,
    );
  } finally {
    this.roleBindingMutationInProgress = false;
  }
}

export async function restoreRoleBinding(
  store: Pick<SessionStorePort, "sessionEntries">,
  sessionId: SessionId,
): Promise<RoleBinding> {
  const entries = await store.sessionEntries?.({ sessionID: sessionId, type: ROLE_BINDING_ENTRY });
  return entries?.length
    ? Object.freeze(roleBindingSchema.parse(entries.at(-1)!.data))
    : { kind: "official" };
}
