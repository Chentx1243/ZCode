import type { RoleBinding } from "@zcode/shared";
import { useEffect, useMemo } from "react";
import { useStore } from "zustand";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { listRolePresets } from "@/lib/rolePresets.js";
import { roleManagementStore } from "@/store/roleManagementStore.js";

export function useRolePresets() {
  const { locale } = useZCodeIntl();
  const selectedRoleId = useStore(roleManagementStore, (state) => state.selectedRoleId);
  const roleGeneration = useStore(roleManagementStore, (state) => state.roleGeneration);
  const setDefaultRole = useStore(roleManagementStore, (state) => state.setDefaultRole);
  const overrides = useStore(roleManagementStore, (state) => state.overrides);
  const loadError = useStore(roleManagementStore, (state) => state.loadError);
  const hydrated = useStore(roleManagementStore, (state) => state.hydrated);
  const createRole = useStore(roleManagementStore, (state) => state.createRole);
  const updateRole = useStore(roleManagementStore, (state) => state.updateRole);
  useEffect(() => roleManagementStore.getState().hydrate(), []);
  const roles = useMemo(() => listRolePresets(overrides, locale), [overrides, locale]);
  return {
    roles,
    selectedRoleId,
    roleGeneration,
    setDefaultRole,
    loadError,
    hydrated,
    createRole,
    updateRole,
  };
}

/** 创建瞬间读取内容快照；预热和无预热创建使用同一解析入口。 */
export function readDefaultRoleBinding(): RoleBinding {
  roleManagementStore.getState().hydrate();
  const state = roleManagementStore.getState();
  if (state.loadError)
    throw new Error("Default role could not be restored; reload before creating a conversation");
  const role = listRolePresets(state.overrides, "zh-CN").find(
    (item) => item.id === state.selectedRoleId,
  );
  if (!role) throw new Error("Default role is unavailable");
  return role.builtin
    ? { kind: "official" }
    : {
        kind: "custom",
        roleId: role.id,
        name: role.name,
        identityPrompt: role.identityPrompt,
        expressionStylePrompt: role.expressionStylePrompt,
      };
}
