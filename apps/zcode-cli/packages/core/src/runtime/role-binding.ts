import { freezeRoleBinding, type RoleBinding } from "@zcode/shared";
import type {
  SessionEntryInfo,
  SessionId,
  SessionStorePort,
  SessionEvent,
  TraceContext,
} from "@zcode/contracts";
import type { AgentRuntimeInternal } from "./internal.js";
import { rebuildContextPrefix } from "./methods/context-refresh.js";
import { MessageHistoryImpl, SessionEventType } from "./deps.js";

export const ROLE_BINDING_ENTRY = "runtime/role_binding";
export const ROLE_BINDING_PENDING_ENTRY = "runtime/role_binding_pending";

function pendingEntry(sessionId: SessionId, event: SessionEvent | null): SessionEntryInfo {
  const timestamp = Date.now();
  return {
    id: `${sessionId}:role-binding-pending`,
    sessionID: sessionId,
    type: ROLE_BINDING_PENDING_ENTRY,
    touchSession: false,
    time: { created: timestamp, updated: timestamp },
    // entry adapter 不接受 null 作为正文，已交付状态用明确墓碑保留稳定记录。
    data: event ?? { delivered: true },
  };
}

const deliveryFlights = new WeakMap<AgentRuntimeInternal, Promise<boolean>>();
export function flushPendingRoleBinding(
  runtime: AgentRuntimeInternal,
  traceContext: TraceContext,
): Promise<boolean> {
  const flight = deliveryFlights.get(runtime);
  if (flight) return flight;
  if (!runtime.pendingRoleBindingEvent) return Promise.resolve(true);
  // 输入、后台命令和事件链可同时请求恢复，共用一次发布，避免检查后重复 append。
  const operation = deliverPendingRoleBinding(runtime, traceContext).finally(() => {
    deliveryFlights.delete(runtime);
  });
  deliveryFlights.set(runtime, operation);
  return operation;
}

async function deliverPendingRoleBinding(
  runtime: AgentRuntimeInternal,
  traceContext: TraceContext,
): Promise<boolean> {
  const event = runtime.pendingRoleBindingEvent;
  if (!event) return true;
  try {
    const existing = (await runtime.eventStore.getEvents(runtime.sessionId)).find(
      (item) => item.id === event.id,
    );
    // append 可能已完成而 sink 失败；重试只通知原事件，不能再次分配序号。
    if (existing) await runtime.notifyEventSinks(existing, traceContext);
    else await runtime.appendEvent(event, traceContext);
    await runtime.sessionStore!.saveSessionEntry!(pendingEntry(runtime.sessionId, null));
    runtime.pendingRoleBindingEvent = undefined;
    return true;
  } catch (error) {
    // 已越过数据库提交点，失败属于同步恢复；不能假报切换失败或回滚新角色。
    runtime.logger?.warn("Committed role binding awaits delivery", {
      event: "role_binding.delivery_pending",
      sessionId: runtime.sessionId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function restorePendingRoleBinding(runtime: AgentRuntimeInternal): Promise<void> {
  const entries = await runtime.sessionStore?.sessionEntries?.({
    sessionID: runtime.sessionId,
    type: ROLE_BINDING_PENDING_ENTRY,
  });
  const data = entries?.at(-1)?.data as SessionEvent | null | undefined;
  if (!data || (data as unknown as { delivered?: boolean }).delivered === true) return;
  if (
    data.type !== SessionEventType.RoleBindingChanged ||
    data.sessionId !== runtime.sessionId ||
    !data.id ||
    !Number.isFinite(new Date(data.timestamp).getTime())
  ) {
    throw new Error("Invalid pending role binding event");
  }
  const binding = freezeRoleBinding((data.payload as { roleBinding: RoleBinding }).roleBinding);
  if (JSON.stringify(binding) !== JSON.stringify(runtime.getRoleBinding())) {
    throw new Error("Pending role binding does not match committed role");
  }
  // 冷恢复属于新 eventStore 序列，保留幂等 ID，但不能复用上一个进程的 seq。
  runtime.pendingRoleBindingEvent = {
    ...data,
    timestamp: new Date(data.timestamp),
    sequenceNumber: 0,
  };
}
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
    data: freezeRoleBinding(binding),
  };
}
export function getRoleBinding(this: AgentRuntimeInternal): RoleBinding {
  return freezeRoleBinding(this.config.roleBinding ?? { kind: "official" });
}
export function bindInitialRole(this: AgentRuntimeInternal, binding: RoleBinding): void {
  // 角色只在创建阶段固定，不能通过初始化入口修改已经运行或恢复的会话。
  if (this.sessionPersisted || this.turnNumber > 0 || this.hasActiveOrQueuedTurnWork()) {
    throw new Error("Role can only be bound to a new, idle session");
  }
  const parsed = freezeRoleBinding(binding);
  if (parsed.kind === "custom" && (this.config.systemPrompt?.trim() || this.config.workflowActor)) {
    throw new Error("Role binding conflicts with custom system prompt or workflow actor");
  }
  this.config.roleBinding = parsed;
  rebuildContextPrefix(this);
}

export async function switchRoleBinding(
  this: AgentRuntimeInternal,
  binding: RoleBinding,
  traceContext: import("@zcode/contracts").TraceContext,
): Promise<void> {
  const parsed = freezeRoleBinding(binding);
  const sameBinding = JSON.stringify(this.getRoleBinding()) === JSON.stringify(parsed);
  if (
    (this.hasActiveOrQueuedTurnWork() && !(sameBinding && this.pendingRoleBindingEvent)) ||
    this.roleBindingMutationInProgress
  ) {
    throw new Error("Role cannot be changed while the session has active or queued turn work");
  }
  if (parsed.kind === "custom" && (this.config.systemPrompt?.trim() || this.config.workflowActor)) {
    throw new Error("Role binding conflicts with custom system prompt or workflow actor");
  }
  const sessionStore = this.sessionStore;
  if (!sessionStore?.commitRoleBinding || !sessionStore.saveSessionEntry) {
    throw new Error("Session role persistence is unavailable");
  }

  this.roleBindingMutationInProgress = true;
  try {
    if (!(await flushPendingRoleBinding(this, traceContext))) {
      throw new Error("Previous role binding delivery is still pending");
    }
    if (JSON.stringify(this.getRoleBinding()) === JSON.stringify(parsed)) return;
    // 准备阶段使用独立配置和消息历史，构建异常不能污染已接受角色与上下文。
    const prepared: AgentRuntimeInternal = Object.create(this);
    prepared.config = { ...this.config, roleBinding: parsed };
    prepared.messageHistory = new MessageHistoryImpl();
    prepared.messageHistory.replaceMessages(this.messageHistory.borrowReadOnlyRuntimeEntries());
    rebuildContextPrefix(prepared);
    const event = this.createEvent(
      SessionEventType.RoleBindingChanged,
      { roleBinding: parsed },
      traceContext,
    );
    await sessionStore.commitRoleBinding({
      binding: buildRoleBindingEntry(this.sessionId, parsed),
      pending: pendingEntry(this.sessionId, event),
    });
    this.config.roleBinding = parsed;
    this.contextBuilder = prepared.contextBuilder;
    this.latestContextBuildResult = prepared.latestContextBuildResult;
    this.messageHistory = prepared.messageHistory;
    this.pendingRoleBindingEvent = event;
    await flushPendingRoleBinding(this, traceContext);
  } finally {
    this.roleBindingMutationInProgress = false;
    // 切换期间已入队的后台命令在同一准入边界恢复，不会跨越未发布的角色事件。
    if (this.runtimeCommandQueue?.hasPending()) void this.drainRuntimeCommandQueue();
  }
}

export async function restoreRoleBinding(
  store: Pick<SessionStorePort, "sessionEntries">,
  sessionId: SessionId,
): Promise<RoleBinding> {
  const entries = await store.sessionEntries?.({ sessionID: sessionId, type: ROLE_BINDING_ENTRY });
  return entries?.length
    ? freezeRoleBinding(entries.at(-1)!.data as RoleBinding)
    : { kind: "official" };
}
