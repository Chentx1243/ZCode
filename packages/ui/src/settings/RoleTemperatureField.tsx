import { LockKeyhole, UnlockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

/** number 输入隐藏浏览器自带的上下步进箭头，仅保留手输与键盘调整。 */
export const ROLE_TEMPERATURE_NO_SPINNER_CLASS =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/**
 * 高级配置里的温度条目：默认锁定，解锁确认后才能编辑，锁定语义与提示词 section 一致。
 * 文本态与解锁警告流程由父级（RolePersonalityDialog）持有，这里只负责渲染与回调。
 */
export function RoleTemperatureField({
  idPrefix,
  value,
  invalid,
  readOnly,
  locked,
  onValueChange,
  onUnlock,
  onReset,
  registerInput,
  registerUnlockTrigger,
}: {
  idPrefix: string;
  value: string;
  invalid: boolean;
  readOnly: boolean;
  locked: boolean;
  onValueChange: (value: string) => void;
  onUnlock: () => void;
  onReset: () => void;
  registerInput: (el: HTMLInputElement | null) => void;
  registerUnlockTrigger: (el: HTMLButtonElement | null) => void;
}) {
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `roles.${key}` });
  const fieldReadOnly = readOnly || locked;
  const inputId = `${idPrefix}-temperature`;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <div className="flex min-w-0 items-center gap-1">
          <label htmlFor={inputId} className="flex items-center gap-1.5 text-ui-sm font-medium">
            {fieldReadOnly ? (
              <LockKeyhole className="size-3.5 text-foreground-subtle" aria-hidden="true" />
            ) : (
              <UnlockKeyhole className="size-3.5 text-foreground-subtle" aria-hidden="true" />
            )}
            {t("temperature")}
          </label>
        </div>
        {!readOnly ? (
          <div className="flex items-center gap-1">
            {locked ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-ui-sm"
                data-testid="role-unlock-temperature"
                ref={registerUnlockTrigger}
                onClick={onUnlock}
              >
                {t("unlock")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-ui-sm"
              disabled={locked || value.trim() === ""}
              data-testid="role-reset-temperature"
              onClick={onReset}
            >
              {t("restoreDefault")}
            </Button>
          </div>
        ) : null}
      </div>
      <p id={`${inputId}-hint`} className="text-ui-sm text-foreground-subtle">
        {t("temperatureHint")}
      </p>
      <Input
        id={inputId}
        data-testid="role-advanced-temperature"
        type="number"
        inputMode="decimal"
        min={0.1}
        max={1}
        step={0.1}
        value={value}
        readOnly={fieldReadOnly}
        placeholder={t("temperaturePlaceholder")}
        aria-describedby={`${inputId}-hint`}
        aria-invalid={invalid || undefined}
        className={ROLE_TEMPERATURE_NO_SPINNER_CLASS}
        ref={registerInput}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {invalid ? (
        <p role="alert" className="text-ui-sm text-destructive">
          {t("temperatureInvalid")}
        </p>
      ) : null}
    </div>
  );
}
