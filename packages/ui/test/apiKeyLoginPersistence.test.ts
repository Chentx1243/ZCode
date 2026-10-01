import assert from "node:assert/strict";
import test from "node:test";
import { ensureProviderFamilyDomainMigration } from "../src/lib/providerFamilyDomainMigration.js";
import { buildLoginApiKeySkipSettings } from "../src/login/LoginApiKeyForm.helpers.js";

type Services = Parameters<typeof ensureProviderFamilyDomainMigration>[0];
const provider = (templateId: string, apiKey = "test-only-key", enabled = true) => ({
  providerId: `${templateId}-2`,
  templateId,
  enabled,
  effectiveConfig: { access: { type: "zhipu-coding-plan-api-key", apiKey } },
});

for (const family of ["zai", "bigmodel"] as const) {
  test(`API key login settings persist ${family}`, () => {
    assert.deepEqual(buildLoginApiKeySkipSettings(family, 123), {
      providerFamilyDomain: family,
      providerFamilyDomainUpdatedAt: 123,
      providerFamilyDomainMigrated: true,
    });
  });
}

for (const scenario of [
  { name: "existing BigModel key", providers: [provider("bigmodel-api")], domain: "bigmodel" },
  { name: "existing Z.ai key", providers: [provider("zai-api")], domain: "zai" },
  {
    name: "ambiguous families",
    providers: [provider("bigmodel-api"), provider("zai-api")],
    domain: null,
  },
  { name: "empty key", providers: [provider("bigmodel-api", " ")], domain: null },
  {
    name: "disabled provider",
    providers: [provider("bigmodel-api", "test-only-key", false)],
    domain: null,
  },
]) {
  test(`restart migration: ${scenario.name}`, async () => {
    let settings: Record<string, unknown> = { providerFamilyDomainMigrated: false };
    let writes = 0;
    const services = {
      settingService: {
        get: async () => settings,
        update: async (patch: object) => {
          settings = { ...settings, ...patch };
          writes++;
        },
      },
      oauthService: { getActiveProvider: async () => null },
      modelSelectionService: { getView: async () => ({ providers: [] }) },
      providerSettingsService: { getView: async () => ({ providers: scenario.providers }) },
    } as unknown as Services;
    await ensureProviderFamilyDomainMigration(services);
    assert.equal(settings.providerFamilyDomain ?? null, scenario.domain);
    await ensureProviderFamilyDomainMigration(services);
    assert.equal(writes, scenario.domain ? 1 : 0);
  });
}
