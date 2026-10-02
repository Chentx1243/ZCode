import { useRef, useState } from "react";
import { Bot, Check, Plus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { SettingsSearchInput } from "@/settings/SettingsSearchInput.js";
import { useRolePresets } from "@/hooks/useRolePresets.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { RoleEditorDialog } from "@/settings/RoleEditorDialog.js";

export function RoleManagementPage() {
  const { intl } = useZCodeIntl();
  const { roles, selectedRoleId, setDefaultRole, loadError, hydrated, createRole, updateRole } =
    useRolePresets();
  const [creating, setCreating] = useState(false);
  const createTrigger = useRef<HTMLButtonElement | null>(null);
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  const role = roles.find((item) => item.id === detailId);
  const t = (id: string) => intl.formatMessage({ id: `roles.${id}` });

  const search = query.trim().toLocaleLowerCase();
  const visibleRoles = roles.filter((item) =>
    [item.name, item.author, item.description].some((value) =>
      value.toLocaleLowerCase().includes(search),
    ),
  );

  return (
    <div className="space-y-5" data-testid="role-management-page">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground lg:text-3xl">
        {t("title")}
      </h1>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-ui-base leading-6 text-foreground-subtle">
          {t("subtitle")}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            ref={createTrigger}
            disabled={!hydrated}
            onClick={() => setCreating(true)}
            variant="default"
            data-testid="role-create"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            {t("create")}
          </Button>
        </div>
      </div>
      <div className="space-y-8">
        <SettingsSearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
          data-testid="role-search"
        />
        <section>
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h2 className="text-ui-lg font-semibold text-foreground">{t("presets")}</h2>
          </div>
          {loadError ? (
            <p role="alert" className="text-ui-sm text-destructive">
              {t("loadError")}
            </p>
          ) : null}
          <div
            className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            data-testid="role-preset-grid"
            aria-busy={!hydrated}
          >
            {visibleRoles.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={!hydrated}
                data-testid="role-preset-card"
                data-role-id={item.id}
                onClick={(event) => {
                  detailTrigger.current = event.currentTarget;
                  setDetailId(item.id);
                }}
                className="flex min-w-0 flex-col gap-3 rounded-xl border border-card-border bg-card p-4 text-left transition-colors hover:border-border-hover hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface text-foreground-subtle">
                    {item.builtin ? (
                      <Bot className="size-5" aria-hidden="true" />
                    ) : (
                      <UserRound className="size-5" aria-hidden="true" />
                    )}
                  </div>
                  {item.id === selectedRoleId ? (
                    <span
                      className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-ui-xs text-foreground"
                      data-testid="role-default-badge"
                    >
                      <Check className="size-3" aria-hidden="true" />
                      {t("currentDefault")}
                    </span>
                  ) : null}
                </div>
                <div className="min-w-0 space-y-1">
                  <h2 className="truncate text-ui-base font-medium text-foreground">{item.name}</h2>
                  <p className="truncate text-ui-sm text-foreground-subtlest">
                    {t("author")}: {item.author || t("unspecified")}
                  </p>
                </div>
                <p className="line-clamp-3 text-ui-sm leading-relaxed text-foreground-subtle">
                  {item.description || t("noDescription")}
                </p>
              </button>
            ))}
          </div>
          {visibleRoles.length === 0 ? (
            <p className="text-ui-base text-foreground-subtle" data-testid="role-search-empty">
              {t("noResults")}
            </p>
          ) : null}
        </section>
      </div>
      {creating ? (
        <RoleEditorDialog
          onClose={() => setCreating(false)}
          onReturnFocus={() => createTrigger.current?.focus()}
          onSave={(_, fields) => {
            const result = createRole(fields);
            if (result.ok) setQuery("");
            return result;
          }}
        />
      ) : null}
      {role ? (
        <RoleEditorDialog
          key={role.id}
          role={role}
          isDefault={role.id === selectedRoleId}
          onSetDefault={setDefaultRole}
          onClose={() => setDetailId(null)}
          onReturnFocus={() => detailTrigger.current?.focus()}
          onSave={updateRole}
        />
      ) : null}
    </div>
  );
}
