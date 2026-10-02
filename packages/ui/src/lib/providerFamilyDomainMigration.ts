import type { IServiceAccessor } from "@zcode/services";
import { isApiKeyAccess } from "@zcode/provider";
import {
  BUILTIN_PROVIDER_TEMPLATE_IDS,
  BUILTIN_MODEL_PROVIDER_IDS,
  type ProviderFamilyDomain,
  resolveModelProviderFamilyIdByProviderId,
  resolveProviderFamilyDomainFromOAuthProvider,
} from "@zcode/shared";
import { logger } from "@/logger.js";

function inferProviderFamilyDomainFromSelection(
  providers: readonly { readonly providerId: string }[],
): ProviderFamilyDomain | null {
  const usableDomains = new Set<ProviderFamilyDomain>();

  for (const provider of providers) {
    const domain = resolveModelProviderFamilyIdByProviderId(provider.providerId);
    if (!domain) continue;
    usableDomains.add(domain);
  }

  if (usableDomains.size !== 1) {
    return null;
  }
  return [...usableDomains][0] ?? null;
}

export async function ensureProviderFamilyDomainMigration(
  services: Pick<
    IServiceAccessor,
    "settingService" | "oauthService" | "modelSelectionService" | "providerSettingsService"
  >,
): Promise<void> {
  const settings = await services.settingService.get();
  if (settings.providerFamilyDomain || settings.providerFamilyDomainMigrated) {
    return;
  }

  let inferredDomain = resolveProviderFamilyDomainFromOAuthProvider(
    await services.oauthService.getActiveProvider(),
  );
  let selectableProviders: readonly { readonly providerId: string }[] | null = null;

  if (!inferredDomain) {
    try {
      selectableProviders = (await services.modelSelectionService.getView()).providers;
      inferredDomain = inferProviderFamilyDomainFromSelection(selectableProviders);
    } catch (error) {
      logger.warn("[providerFamilyDomainMigration] 读取模型选择视图失败", {
        error,
      });
    }
  }

  if (!inferredDomain) {
    // 旧登录流程只保存 API Key；运行域为空时模型选择投影可能隐藏已保存的提供方，需从设置视图恢复。
    const configuredProviders = (await services.providerSettingsService.getView()).providers.filter(
      (provider) =>
        provider.enabled &&
        isApiKeyAccess(provider.effectiveConfig.access) &&
        Boolean(provider.effectiveConfig.access.apiKey?.trim()),
    );
    inferredDomain = inferProviderFamilyDomainFromSelection(
      configuredProviders.map((provider) => ({
        providerId:
          provider.templateId === BUILTIN_PROVIDER_TEMPLATE_IDS.bigmodel
            ? BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan
            : provider.templateId === BUILTIN_PROVIDER_TEMPLATE_IDS.zai
              ? BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan
              : provider.providerId,
      })),
    );
  }

  if (!inferredDomain && selectableProviders?.length === 0) {
    // 启动早期 OAuth active provider 和 Registry 可能都还没恢复。
    // 此时如果把“空结果”标记为已迁移，会让后续草稿预热在 selectedKey 为空时吃到旧 Start Plan 偏好。
    logger.info("[providerFamilyDomainMigration] provider family domain 迁移等待模型选择视图恢复");
    return;
  }

  await services.settingService.update({
    ...(inferredDomain ? { providerFamilyDomain: inferredDomain } : {}),
    providerFamilyDomainUpdatedAt: Date.now(),
    providerFamilyDomainMigrated: true,
  });

  logger.info("[providerFamilyDomainMigration] provider family domain 迁移完成", {
    inferredDomain,
  });
}
