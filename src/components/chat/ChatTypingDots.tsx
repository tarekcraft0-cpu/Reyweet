export function ChatTypingDots({ label }: { label?: string }) {
  return (
    <span className="chat-typing-dots inline-flex items-center gap-1.5">
      {label ? <span className="text-inherit">{label}</span> : null}
      <span className="inline-flex items-center gap-[3px]" aria-hidden>
        <span className="chat-typing-dot" />
        <span className="chat-typing-dot chat-typing-dot--2" />
        <span className="chat-typing-dot chat-typing-dot--3" />
      </span>
    </span>
  );
}
