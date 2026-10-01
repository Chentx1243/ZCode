import { useEffect, useId, useRef, useState } from "react";
import { ChevronRight, LockKeyhole, UnlockKeyhole } from "lucide-react";
import {
  ROLE_PROMPT_SECTIONS,
  ROLE_PROMPT_SECTION_IDS,
  normalizeRolePromptOverrides,
  resolveRolePrompt,
  type RolePromptSectionId,
} from "@zcode/shared";
import { Button } from "@/components/ui/button.js";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.js";
import { SettingsFormTextarea } from "@/settings/SettingsFormTextarea.js";
import { RoleFields } from "@/settings/RoleFields.js";
import { RolePromptReferenceTooltip } from "@/settings/RolePromptReferenceTooltip.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { RolePresetFields } from "@/lib/rolePresets.js";

type PersonalityFields = Pick<
  RolePresetFields,
  "identityPrompt" | "expressionStylePrompt" | "promptOverrides"
>;

export function RolePersonalityDialog({
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
  onConfirm: (fields: PersonalityFields) => void;
}) {
  const [local, setLocal] = useState(draft);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [unlocked, setUnlocked] = useState<ReadonlySet<RolePromptSectionId>>(() => new Set());
  const [warning, setWarning] = useState<RolePromptSectionId | null>(null);
  const [focusField, setFocusField] = useState<RolePromptSectionId | null>(null);
  const [invalidField, setInvalidField] = useState<RolePromptSectionId | null>(null);
  const fields = useRef<Partial<Record<RolePromptSectionId, HTMLTextAreaElement | null>>>({});
  const triggers = useRef<Partial<Record<RolePromptSectionId, HTMLButtonElement | null>>>({});
  const cancelWarning = useRef<HTMLButtonElement | null>(null);
  const confirmedUnlock = useRef(false);
  const warningTarget = useRef<RolePromptSectionId | null>(null);
  const id = useId();
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `roles.${key}` });
  const count = Object.keys(normalizeRolePromptOverrides(local.promptOverrides) ?? {}).length;

  useEffect(() => {
    if (advancedOpen && focusField) {
      fields.current[focusField]?.focus();
      setFocusField(null);
    }
  }, [advancedOpen, focusField]);

  const confirm = () => {
    const invalid = ROLE_PROMPT_SECTION_IDS.find((key) => {
      const value = local.promptOverrides?.[key];
      return value !== undefined && !value.trim();
    });
    if (invalid) {
      setInvalidField(invalid);
      setAdvancedOpen(true);
      setFocusField(invalid);
      return;
    }
    onConfirm({
      identityPrompt: local.identityPrompt,
      expressionStylePrompt: local.expressionStylePrompt,
      promptOverrides: normalizeRolePromptOverrides(local.promptOverrides),
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !warning) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-xl"
        data-testid="role-personality-dialog"
        onEscapeKeyDown={(event) => {
          if (warning) event.preventDefault();
        }}
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
          <Collapsible
            open={advancedOpen}
            onOpenChange={setAdvancedOpen}
            className="border-t border-border pt-4"
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-start gap-2 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="role-advanced-toggle"
              >
                <ChevronRight
                  aria-hidden="true"
                  className={`mt-0.5 size-4 shrink-0 transition-transform ${advancedOpen ? "rotate-90" : ""}`}
                />
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex flex-wrap items-center gap-2 text-ui-sm font-medium">
                    {t("advanced")}
                    {count > 0 ? (
                      <span
                        className="rounded-md bg-accent px-1.5 py-0.5 text-ui-xs font-normal text-foreground-subtle"
                        data-testid="role-advanced-count"
                      >
                        {intl.formatMessage({ id: "roles.advancedCount" }, { count })}
                      </span>
                    ) : null}
                  </span>
                  <span className="block text-ui-sm text-foreground-subtle">
                    {t("advancedHint")}
                  </span>
                </span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent data-testid="role-advanced-content">
              <div className="space-y-5 pt-4">
                {ROLE_PROMPT_SECTION_IDS.map((key) => {
                  const locked = ROLE_PROMPT_SECTIONS[key].locked && !unlocked.has(key);
                  const fieldReadOnly = readOnly || locked;
                  return (
                    <div key={key} className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <div className="flex min-w-0 items-center gap-1">
                          <label
                            htmlFor={`${id}-${key}`}
                            className="flex items-center gap-1.5 text-ui-sm font-medium"
                          >
                            {ROLE_PROMPT_SECTIONS[key].locked ? (
                              fieldReadOnly ? (
                                <LockKeyhole
                                  className="size-3.5 text-foreground-subtle"
                                  aria-hidden="true"
                                />
                              ) : (
                                <UnlockKeyhole
                                  className="size-3.5 text-foreground-subtle"
                                  aria-hidden="true"
                                />
                              )
                            ) : null}
                            {t(`advanced.${key}.title`)}
                          </label>
                          <RolePromptReferenceTooltip section={key} />
                        </div>
                        {!readOnly ? (
                          <div className="flex items-center gap-1">
                            {locked ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-ui-sm"
                                data-testid={`role-unlock-${key}`}
                                ref={(el) => {
                                  triggers.current[key] = el;
                                }}
                                onClick={() => {
                                  confirmedUnlock.current = false;
                                  warningTarget.current = key;
                                  setWarning(key);
                                }}
                              >
                                {t("unlock")}
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-ui-sm"
                              disabled={locked || local.promptOverrides?.[key] === undefined}
                              data-testid={`role-reset-${key}`}
                              onClick={() => {
                                setLocal((current) => {
                                  const next = { ...current.promptOverrides };
                                  delete next[key];
                                  return { ...current, promptOverrides: next };
                                });
                                if (invalidField === key) setInvalidField(null);
                              }}
                            >
                              {t("restoreDefault")}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                      <p id={`${id}-${key}-hint`} className="text-ui-sm text-foreground-subtle">
                        {t(`advanced.${key}.description`)}
                      </p>
                      <SettingsFormTextarea
                        id={`${id}-${key}`}
                        rows={6}
                        value={resolveRolePrompt(key, local.promptOverrides)}
                        readOnly={fieldReadOnly}
                        data-testid={`role-advanced-${key}`}
                        ref={(el) => {
                          fields.current[key] = el;
                        }}
                        aria-describedby={`${id}-${key}-hint`}
                        aria-invalid={invalidField === key || undefined}
                        className="max-h-64 overflow-y-auto text-mobile-input-safe sm:text-ui-base"
                        onChange={(event) => {
                          const value = event.target.value;
                          setLocal((current) => ({
                            ...current,
                            promptOverrides: { ...current.promptOverrides, [key]: value },
                          }));
                          if (invalidField === key) setInvalidField(null);
                        }}
                      />
                      {invalidField === key ? (
                        <p role="alert" className="text-ui-sm text-destructive">
                          {t("advancedRequired")}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
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
              onClick={confirm}
            >
              {t("confirm")}
            </Button>
          ) : null}
        </DialogFooter>
        <AlertDialog
          open={warning !== null}
          onOpenChange={(open) => {
            if (!open) setWarning(null);
          }}
        >
          <AlertDialogContent
            data-testid="role-unlock-warning"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              cancelWarning.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              const target = warningTarget.current;
              if (target)
                (confirmedUnlock.current
                  ? fields.current[target]
                  : triggers.current[target]
                )?.focus();
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>{t("unlockTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("unlockWarning")}</AlertDialogDescription>
              {warning ? (
                <p className="text-ui-sm text-foreground-subtle">{t(`advanced.${warning}.risk`)}</p>
              ) : null}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button
                ref={cancelWarning}
                type="button"
                variant="outline"
                data-testid="role-unlock-cancel"
                onClick={() => setWarning(null)}
              >
                {t("cancel")}
              </Button>
              <Button
                type="button"
                data-testid="role-unlock-confirm"
                onClick={() => {
                  if (warning) setUnlocked((current) => new Set([...current, warning]));
                  confirmedUnlock.current = true;
                  setWarning(null);
                }}
              >
                {t("confirmUnlock")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
