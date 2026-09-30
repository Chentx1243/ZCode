import { createStore } from "zustand/vanilla";
import {
  OFFICIAL_ROLE_TEMPLATE,
  getRolePresetDefinition,
  isRolePresetFields,
  normalizeRolePresetFields,
  type RolePresetFields,
  type RolePresetOverrides,
} from "../lib/rolePresets.js";

export const ROLE_PRESETS_STORAGE_KEY = "zcode-role-presets-v2";

export const LEGACY_ROLE_PRESETS_STORAGE_KEY = "zcode-role-presets-v1";
const customId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RolePresetStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type RoleUpdateResult =
  | { ok: true; error?: never }
  | { ok: false; error: "readonly" | "not-found" | "required" | "storage" };

interface RoleManagementState {
  selectedRoleId: string;
  roleGeneration: number;
  setDefaultRole: (id: string) => RoleUpdateResult;
  overrides: RolePresetOverrides;
  hydrated: boolean;
  loadError: "storage" | "invalid" | null;
  hydrate: () => void;
  createRole: (fields: RolePresetFields) => RoleUpdateResult;
  updateRole: (id: string, fields: RolePresetFields) => RoleUpdateResult;
}

function readOverrides(raw: string, legacy = false): RolePresetOverrides {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") throw new Error("invalid");
  const record = parsed as { version?: unknown; overrides?: unknown };
  if (
    record.version !== (legacy ? 1 : 2) ||
    !record.overrides ||
    typeof record.overrides !== "object" ||
    Array.isArray(record.overrides)
  ) {
    throw new Error("invalid");
  }
  const overrides: RolePresetOverrides = {};
  for (const [id, fields] of Object.entries(record.overrides)) {
    const definition = getRolePresetDefinition(id);
    if (definition?.builtin || (!definition && (legacy || !customId.test(id)))) continue;
    const value =
      legacy && fields && typeof fields === "object"
        ? {
            ...fields,
            identityPrompt: (fields as { prompt?: unknown }).prompt,
            expressionStylePrompt: OFFICIAL_ROLE_TEMPLATE.expressionStylePrompt,
          }
        : fields;
    if (!isRolePresetFields(value)) throw new Error("invalid");
    overrides[id] = normalizeRolePresetFields(value);
  }
  return overrides;
}

export function createRoleManagementStore(
  getStorage: () => RolePresetStorage = () => window.localStorage,
) {
  return createStore<RoleManagementState>()((set, get) => ({
    selectedRoleId: "zcode-official",
    roleGeneration: 0,
    overrides: {},
    hydrated: false,
    loadError: null,
    hydrate: () => {
      if (get().hydrated) return;
      let raw: string | null;
      try {
        raw = getStorage().getItem(ROLE_PRESETS_STORAGE_KEY);
      } catch {
        set({ hydrated: true, loadError: "storage" });
        return;
      }
      try {
        if (raw !== null) {
          const overrides = readOverrides(raw);
          const selectedRoleId =
            (JSON.parse(raw) as { selectedRoleId?: unknown }).selectedRoleId ?? "zcode-official";
          if (
            typeof selectedRoleId !== "string" ||
            (!getRolePresetDefinition(selectedRoleId) && !overrides[selectedRoleId])
          )
            throw new Error("invalid default role");
          set({
            overrides,
            selectedRoleId,
            hydrated: true,
            roleGeneration: get().roleGeneration + 1,
          });
          return;
        }
        const legacy = getStorage().getItem(LEGACY_ROLE_PRESETS_STORAGE_KEY);
        const overrides = legacy === null ? {} : readOverrides(legacy, true);
        if (legacy !== null) {
          try {
            getStorage().setItem(
              ROLE_PRESETS_STORAGE_KEY,
              JSON.stringify({ version: 2, overrides, selectedRoleId: get().selectedRoleId }),
            );
          } catch {
            set({ hydrated: true, loadError: "storage" });
            return;
          }
        }
        set({ overrides, hydrated: true, roleGeneration: get().roleGeneration + 1 });
      } catch {
        set({ hydrated: true, loadError: "invalid" });
      }
    },
    setDefaultRole: (id) => {
      get().hydrate();
      if (!getRolePresetDefinition(id) && !get().overrides[id])
        return { ok: false, error: "not-found" };
      if (get().loadError) return { ok: false, error: "storage" };
      if (get().selectedRoleId === id) return { ok: true };
      try {
        getStorage().setItem(
          ROLE_PRESETS_STORAGE_KEY,
          JSON.stringify({ version: 2, overrides: get().overrides, selectedRoleId: id }),
        );
      } catch {
        return { ok: false, error: "storage" };
      }
      set({ selectedRoleId: id, roleGeneration: get().roleGeneration + 1 });
      return { ok: true };
    },
    createRole: (fields) => {
      if (!isRolePresetFields(fields)) return { ok: false, error: "required" };
      get().hydrate();
      // 恢复失败时不能用空状态覆盖旧资料；保留草稿，重新加载后重试。
      if (get().loadError) return { ok: false, error: "storage" };
      const id = crypto.randomUUID();
      const overrides = { ...get().overrides, [id]: normalizeRolePresetFields(fields) };
      try {
        getStorage().setItem(
          ROLE_PRESETS_STORAGE_KEY,
          JSON.stringify({ version: 2, overrides, selectedRoleId: get().selectedRoleId }),
        );
      } catch {
        return { ok: false, error: "storage" };
      }
      set({
        overrides,
        loadError: null,
        roleGeneration: get().roleGeneration + (get().selectedRoleId === id ? 1 : 0),
      });
      return { ok: true };
    },
    updateRole: (id, fields) => {
      get().hydrate();
      const definition = getRolePresetDefinition(id);
      if (!definition && !get().overrides[id]) return { ok: false, error: "not-found" };
      if (definition?.builtin) return { ok: false, error: "readonly" };
      if (!isRolePresetFields(fields)) return { ok: false, error: "required" };
      if (get().loadError) return { ok: false, error: "storage" };
      const overrides = { ...get().overrides, [id]: normalizeRolePresetFields(fields) };
      try {
        getStorage().setItem(
          ROLE_PRESETS_STORAGE_KEY,
          JSON.stringify({ version: 2, overrides, selectedRoleId: get().selectedRoleId }),
        );
      } catch {
        return { ok: false, error: "storage" };
      }
      set({
        overrides,
        loadError: null,
        roleGeneration: get().roleGeneration + (get().selectedRoleId === id ? 1 : 0),
      });
      return { ok: true };
    },
  }));
}

export const roleManagementStore = createRoleManagementStore();
