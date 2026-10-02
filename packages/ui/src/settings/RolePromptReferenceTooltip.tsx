import { CircleHelp } from "lucide-react";
import { useCallback, useState } from "react";
import type { RolePromptSectionId } from "@zcode/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { ROLE_PROMPT_CHINESE_REFERENCES } from "@/lib/rolePromptReferences.js";

export function RolePromptReferenceTooltip({ section }: { section: RolePromptSectionId }) {
  const { intl } = useZCodeIntl();
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const attachTrigger = useCallback((element: HTMLButtonElement | null) => {
    // Dialog 会锁住外部滚动；提示层挂载到当前弹窗内，长译文才能接收滚轮。
    setContainer(element?.closest<HTMLElement>('[role="dialog"]') ?? null);
  }, []);
  const title = intl.formatMessage({ id: "roles.defaultChineseReference" });
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          ref={attachTrigger}
          aria-label={title}
          data-testid={`role-reference-${section}`}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded text-foreground-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CircleHelp className="size-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        portalContainer={container}
        side="bottom"
        align="start"
        sideOffset={6}
        collisionPadding={16}
        className="block max-h-[min(24rem,60dvh)] w-[28rem] max-w-[calc(100vw-2rem)] overflow-y-auto whitespace-pre-wrap break-words text-ui-sm"
        data-testid={`role-reference-content-${section}`}
      >
        <p className="mb-2 font-medium">{title}</p>
        <p lang="zh-CN">{ROLE_PROMPT_CHINESE_REFERENCES[section]}</p>
      </TooltipContent>
    </Tooltip>
  );
}
