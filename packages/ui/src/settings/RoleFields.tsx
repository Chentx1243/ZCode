import { useId } from "react";
import { Input } from "@/components/ui/input.js";
import { SettingsFormTextarea } from "@/settings/SettingsFormTextarea.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { RolePresetFields } from "@/lib/rolePresets.js";
export type RoleTextField = Exclude<keyof RolePresetFields, "promptOverrides" | "temperature">;

export function RoleFields({
  fields,
  draft,
  readOnly,
  onChange,
}: {
  fields: readonly RoleTextField[];
  draft: RolePresetFields;
  readOnly: boolean;
  onChange: (field: RoleTextField, value: string) => void;
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
          className: "max-h-64 overflow-y-auto text-mobile-input-safe sm:text-ui-base",
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
