import { useState } from "react";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import { selectTriggerVariants } from "@/components/ui/select.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  BUILTIN_SOURCE_HAN_SANS_SC_FAMILY,
  BUILTIN_SOURCE_HAN_SANS_SC_FONT_ID,
  DEFAULT_UI_FONT_FAMILY,
  DEFAULT_UI_FONT_FAMILY_STACK,
} from "@/lib/uiFontFamily.js";
import { cn } from "@/components/lib/utils.js";

// queryLocalFonts 在 Windows 上只返回英文 family 名（如 "Microsoft YaHei"），
// 中文用户按「微软雅黑」等本地名搜索会落空；这里只为检索补别名，展示与存储仍用真实 family 名。
const CJK_FONT_SEARCH_ALIASES: Record<string, string[]> = {
  "Microsoft YaHei": ["微软雅黑"],
  "Microsoft YaHei UI": ["微软雅黑"],
  SimSun: ["宋体"],
  NSimSun: ["新宋体"],
  SimHei: ["黑体"],
  KaiTi: ["楷体"],
  FangSong: ["仿宋"],
  DengXian: ["等线"],
  "PingFang SC": ["苹方"],
  "Hiragino Sans GB": ["冬青黑体"],
  "Noto Sans CJK SC": ["思源黑体"],
  "Source Han Sans SC": ["思源黑体"],
};

/**
 * 外观设置的字体选择下拉：固定项（跟随系统、内置思源黑体）+ 懒加载的系统字体。
 * 系统字体列表来自 IPlatformService.listSystemFonts（桌面枚举安装字体，Web 降级预设），
 * 加载失败只影响系统字体分组，固定项仍可选。
 */
export function FontFamilyPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { intl } = useZCodeIntl();
  const platform = usePlatform();
  const [open, setOpen] = useState(false);
  const [systemFonts, setSystemFonts] = useState<string[] | null>(null);
  const [loadingSystemFonts, setLoadingSystemFonts] = useState(false);
  const [systemFontsError, setSystemFontsError] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen || systemFonts !== null || loadingSystemFonts) {
      return;
    }
    setLoadingSystemFonts(true);
    setSystemFontsError(false);
    platform
      .listSystemFonts()
      .then((fonts) => {
        setSystemFonts(fonts);
      })
      .catch(() => {
        setSystemFontsError(true);
      })
      .finally(() => {
        setLoadingSystemFonts(false);
      });
  };

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  const triggerLabel =
    value === DEFAULT_UI_FONT_FAMILY
      ? intl.formatMessage({ id: "settings.uiFontFamily.system" })
      : value === BUILTIN_SOURCE_HAN_SANS_SC_FONT_ID
        ? intl.formatMessage({ id: "settings.uiFontFamily.builtinSourceHanSans" })
        : value;

  const renderCheck = (optionValue: string) =>
    optionValue === value ? (
      <CheckIcon className="ml-auto size-4 shrink-0 text-foreground-subtle" />
    ) : null;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        data-testid="settings-font-family-trigger"
        className={cn(selectTriggerVariants({ size: "lg" }), "w-[260px] min-w-0 justify-between")}
      >
        <span className="min-w-0 truncate">{triggerLabel}</span>
        <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-foreground-subtle" />
      </PopoverTrigger>
      {/* 外壳对齐 SelectContent：bg-menu + border-popover-border + rounded-lg，
          右缘与触发器对齐（触发器位于设置行右侧）。 */}
      <PopoverContent
        align="end"
        className="w-[280px] gap-0 rounded-lg border-popover-border bg-menu p-0 text-foreground"
      >
        <Command className="rounded-lg bg-menu p-0 text-foreground">
          <CommandInput
            placeholder={intl.formatMessage({ id: "settings.uiFontFamily.searchPlaceholder" })}
          />
          <CommandList>
            <CommandEmpty>
              {intl.formatMessage({ id: "settings.uiFontFamily.noMatches" })}
            </CommandEmpty>
            <CommandGroup
              heading={intl.formatMessage({ id: "settings.uiFontFamily.presetGroup" })}
            >
              <CommandItem
                value={DEFAULT_UI_FONT_FAMILY}
                onSelect={handleSelect}
                className="rounded-md px-2 py-1"
              >
                <span className="min-w-0 flex-1 truncate">
                  {intl.formatMessage({ id: "settings.uiFontFamily.system" })}
                </span>
                {renderCheck(DEFAULT_UI_FONT_FAMILY)}
              </CommandItem>
              <CommandItem
                value={BUILTIN_SOURCE_HAN_SANS_SC_FONT_ID}
                keywords={["思源黑体", "Source Han Sans"]}
                onSelect={handleSelect}
                className="rounded-md px-2 py-1"
              >
                <span
                  className="min-w-0 flex-1 truncate"
                  style={{ fontFamily: BUILTIN_SOURCE_HAN_SANS_SC_FAMILY }}
                >
                  {intl.formatMessage({ id: "settings.uiFontFamily.builtinSourceHanSans" })}
                </span>
                {renderCheck(BUILTIN_SOURCE_HAN_SANS_SC_FONT_ID)}
              </CommandItem>
            </CommandGroup>
            <CommandGroup
              heading={intl.formatMessage({ id: "settings.uiFontFamily.systemGroup" })}
            >
              {loadingSystemFonts ? (
                <div className="px-2 py-1.5 text-ui-base/relaxed text-foreground-subtlest">
                  {intl.formatMessage({ id: "settings.uiFontFamily.loadingSystemFonts" })}
                </div>
              ) : null}
              {systemFontsError ? (
                <div className="px-2 py-1.5 text-ui-base/relaxed text-foreground-subtlest">
                  {intl.formatMessage({ id: "settings.uiFontFamily.loadSystemFontsFailed" })}
                </div>
              ) : null}
              {(systemFonts ?? []).map((familyName) => (
                <CommandItem
                  key={familyName}
                  value={familyName}
                  keywords={CJK_FONT_SEARCH_ALIASES[familyName]}
                  onSelect={handleSelect}
                  className="rounded-md px-2 py-1"
                >
                  <span
                    className="min-w-0 flex-1 truncate"
                    style={{ fontFamily: `"${familyName}", ${DEFAULT_UI_FONT_FAMILY_STACK}` }}
                  >
                    {familyName}
                  </span>
                  {renderCheck(familyName)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
