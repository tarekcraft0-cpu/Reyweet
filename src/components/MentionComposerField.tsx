import { useRef, type RefObject, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import {
  type MentionPillVariant,
  renderComposerMentionOverlay,
} from "@/lib/renderMentionHashtagText";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  mentionVariant?: MentionPillVariant;
  overlayClassName?: string;
  /** كلاسات تُطبَّق على الـ div الخارجي — استخدمها لخلفية الحاوية (bg-input…) بدل تمريرها للـ textarea */
  wrapperClassName?: string;
};

export function MentionComposerField({
  value,
  onChange,
  textareaRef,
  mentionVariant = "composer",
  className,
  overlayClassName,
  wrapperClassName,
  ...rest
}: Props) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? innerRef;

  return (
    <div className={cn("relative min-w-0 flex-1", wrapperClassName)}>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-0 overflow-hidden whitespace-pre-wrap break-words",
          overlayClassName,
          !value && "opacity-0",
        )}
      >
        {value ? renderComposerMentionOverlay(value, mentionVariant) : null}
      </div>
      <textarea
        {...rest}
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={cn(
          "relative z-[1] w-full resize-none caret-current selection:bg-primary/25",
          value ? "text-transparent" : "text-inherit",
          className,
        )}
        style={{
          backgroundColor: "transparent",
          color: value ? "transparent" : undefined,
          ...(rest.style ?? {}),
        }}
      />
    </div>
  );
}
