import { useId, useRef, useState, type FormEvent } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { SettingsFormTextarea } from "@/settings/SettingsFormTextarea.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  OFFICIAL_ROLE_TEMPLATE,
  type RolePreset,
  type RolePresetFields,
} from "@/lib/rolePresets.js";
import type { RoleUpdateResult } from "@/store/roleManagementStore.js";

export function RoleEditorDialog({
  role,
  isDefault,
  onSetDefault,
  onClose,
  onReturnFocus,
  onSave,
}: {
  role?: RolePreset;
  isDefault?: boolean;
  onSetDefault?: (id: string) => RoleUpdateResult;
  onClose: () => void;
  onReturnFocus: () => void;
  onSave: (id: string, fields: RolePresetFields) => RoleUpdateResult;
}) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `roles.${id}` });
  const [draft, setDraft] = useState<RolePresetFields>(() =>
    role
      ? {
          name: role.name,
          author: role.author,
          description: role.description,
          identityPrompt: role.identityPrompt,
          expressionStylePrompt: role.expressionStylePrompt,
        }
      : { name: "", description: "", author: t("localCreated"), ...OFFICIAL_ROLE_TEMPLATE },
  );
  const [personalityOpen, setPersonalityOpen] = useState(false);
  const personalityTrigger = useRef<HTMLButtonElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const readonly = Boolean(role?.builtin);
  const invalid =
    !draft.name.trim() || !draft.identityPrompt.trim() || !draft.expressionStylePrompt.trim();
  const changed =
    !role ||
    (Object.keys(draft) as (keyof RolePresetFields)[]).some(
      (field) => draft[field] !== role[field],
    );
  const save = (event: FormEvent) => {
    event.preventDefault();
    const result = onSave(role?.id ?? "", draft);
    if (result.ok) onClose();
    else setError(t(result.error === "required" ? "requiredError" : "saveError"));
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !personalityOpen) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-xl"
        data-testid={role ? "role-detail-dialog" : "role-create-dialog"}
        onEscapeKeyDown={(event) => {
          if (personalityOpen) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onReturnFocus();
        }}
      >
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>{t(role ? "details" : "create")}</DialogTitle>
          <DialogDescription>{t(readonly ? "officialReadOnly" : "editableHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex min-h-0 flex-col gap-4">
          <div className="min-h-0 space-y-4 overflow-y-auto">
            <RoleFields
              fields={
                role
                  ? ["name", "description"]
                  : ["name", "description", "identityPrompt", "expressionStylePrompt"]
              }
              draft={draft}
              readOnly={readonly}
              onChange={(field, value) => {
                setDraft((current) => ({ ...current, [field]: value }));
                setError(null);
              }}
            />
            {role ? (
              <Button
                ref={personalityTrigger}
                type="button"
                variant="outline"
                className="w-full justify-between"
                data-testid="role-personality-open"
                onClick={() => setPersonalityOpen(true)}
              >
                {t("personality")}
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="text-ui-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter className="shrink-0">
            {role ? (
              <Button
                type="button"
                variant="outline"
                disabled={isDefault || changed}
                data-testid="role-set-default"
                onClick={() => {
                  const result = onSetDefault?.(role.id);
                  if (result?.ok) onClose();
                  else setError(t("saveError"));
                }}
              >
                {t(isDefault ? "currentDefault" : "setDefault")}
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={onClose}>
              {t(readonly ? "close" : "cancel")}
            </Button>
            {!readonly ? (
              <Button type="submit" disabled={invalid || !changed} data-testid="role-save">
                {t("save")}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
        {personalityOpen ? (
          <RolePersonalityDialog
            draft={draft}
            readOnly={readonly}
            onClose={() => setPersonalityOpen(false)}
            onReturnFocus={() => personalityTrigger.current?.focus()}
            onConfirm={(fields) => {
              setDraft((current) => ({ ...current, ...fields }));
              setError(null);
              setPersonalityOpen(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RoleFields({
  fields,
  draft,
  readOnly,
  onChange,
}: {
  fields: readonly (keyof RolePresetFields)[];
  draft: RolePresetFields;
  readOnly: boolean;
  onChange: (field: keyof RolePresetFields, value: string) => void;
}) {
  const id = useId();
  const { intl } = useZCodeIntl();
  return (
    <>
      {fields.map((field) => {
        const required = field !== "description";
        const props = {
          id: `${id}-${field}`,
          "data-testid": `role-field-${field}`,
          value: draft[field],
          readOnly,
          required,
          onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            onChange(field, event.target.value),
          className: "text-mobile-input-safe sm:text-ui-base",
        };
        return (
          <div key={field} className="space-y-1.5">
            <label htmlFor={props.id} className="text-ui-sm font-medium text-foreground">
              {intl.formatMessage({ id: `roles.${field}` })}
              {required && !readOnly ? " *" : ""}
            </label>
            {field === "name" ? (
              <Input {...props} />
            ) : (
              <SettingsFormTextarea {...props} rows={field === "description" ? 3 : 7} />
            )}
          </div>
        );
      })}
    </>
  );
}

function RolePersonalityDialog({
  draft,
  readOnly,
  onClose,
  onReturnFocus,
  onConfirm,
}: {
  draft: RolePresetFields;
  readOnly: boolean;
  onClose: () => void;
  onReturnFocus: () => void;
  onConfirm: (fields: Pick<RolePresetFields, "identityPrompt" | "expressionStylePrompt">) => void;
}) {
  const [local, setLocal] = useState(draft);
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `roles.${id}` });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-xl"
        data-testid="role-personality-dialog"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onReturnFocus();
        }}
      >
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>{t("personality")}</DialogTitle>
          <DialogDescription>
            {t(readOnly ? "officialReference" : "personalityHint")}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto">
          <RoleFields
            fields={["identityPrompt", "expressionStylePrompt"]}
            draft={local}
            readOnly={readOnly}
            onChange={(field, value) => setLocal((current) => ({ ...current, [field]: value }))}
          />
        </div>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={onClose}>
            {t(readOnly ? "close" : "cancel")}
          </Button>
          {!readOnly ? (
            <Button
              type="button"
              disabled={!local.identityPrompt.trim() || !local.expressionStylePrompt.trim()}
              data-testid="role-personality-confirm"
              onClick={() =>
                onConfirm({
                  identityPrompt: local.identityPrompt,
                  expressionStylePrompt: local.expressionStylePrompt,
                })
              }
            >
              {t("confirm")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
