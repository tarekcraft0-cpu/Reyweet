import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import type { ID, StoryItem, StorySticker } from "@/lib/types";

function CountdownBlock({ targetAt, title }: { targetAt: number; title: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, targetAt - now);
  const d = Math.floor(left / 86400000);
  const h = Math.floor((left % 86400000) / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  const s = Math.floor((left % 60000) / 1000);
  const line = d > 0 ? `${d}ي ${h}س` : h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  return (
    <div className="rounded-2xl bg-white text-black px-3 py-2.5 shadow-lg min-w-[9rem] text-center border border-black/5">
      <div className="text-[10px] font-semibold tracking-wide text-black/50">{title}</div>
      <div className="text-lg font-bold tabular-nums mt-0.5">{left <= 0 ? "0:00" : line}</div>
    </div>
  );
}

function wrapStyle(sk: StorySticker) {
  const rot = sk.rotation ?? 0;
  return {
    left: `${sk.x}%`,
    top: `${sk.y}%`,
    transform: `translate(-50%, -50%) rotate(${rot}deg)`,
  } as const;
}

export function StoryStickerLayer({
  story,
  storyAuthorId,
  onOpenProfile,
}: {
  story: StoryItem;
  storyAuthorId: ID;
  onOpenProfile?: (id: ID) => void;
}) {
  const { currentUser, voteStoryPoll, answerStoryQuiz, rateStorySlider, openOrCreateChat, sendMessage, isGuest } = useApp();
  const me = currentUser!;
  const isOwn = me.id === storyAuthorId;
  const list = story.stickers || [];

  const [sliderDraft, setSliderDraft] = useState<Record<string, number>>({});

  const sendQuestion = (sk: Extract<StorySticker, { kind: "question" }>) => {
    if (isGuest) {
      notifyGuestActionBlocked();
      return;
    }
    const text = window.prompt(`رد على: «${sk.prompt}»`, "");
    if (!text?.trim()) return;
    const ch = openOrCreateChat(storyAuthorId);
    if (!ch) {
      if (isGuest) notifyGuestActionBlocked();
      else window.alert("تعذّر فتح المحادثة.");
      return;
    }
    sendMessage(ch.id, { type: "text", content: `↩️ رد على ملصق السؤال في الستوري:\n«${sk.prompt}»\n—\n${text.trim()}` });
  };

  if (list.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-[25]">
      {list.map(sk => (
        <div key={sk.id} className="absolute pointer-events-auto" style={wrapStyle(sk)} onClick={e => e.stopPropagation()}>
          {sk.kind === "poll" && <PollSticker sk={sk} storyId={story.id} isOwn={isOwn} meId={me.id} voteStoryPoll={voteStoryPoll} />}
          {sk.kind === "question" && (
            <button
              type="button"
              disabled={isOwn}
              onClick={() => sendQuestion(sk)}
              className={
                "rounded-2xl px-3 py-2.5 shadow-lg text-start min-w-[10rem] max-w-[14rem] border border-white/20 bg-gradient-to-br from-[#a855f7] via-[#ec4899] to-[#f97316] text-white " +
                (isOwn ? "opacity-75 cursor-default" : "active:scale-[0.98]")
              }
            >
              <div className="text-[10px] opacity-90">اسألني</div>
              <div className="text-sm font-semibold leading-snug">{sk.prompt}</div>
              {!isOwn && <div className="text-[10px] mt-1 opacity-90 underline">اضغط للرد في الخاص</div>}
            </button>
          )}
          {sk.kind === "countdown" && <CountdownBlock targetAt={sk.targetAt} title={sk.title} />}
          {sk.kind === "location" && (
            <div className="rounded-2xl bg-white text-black px-3 py-2 shadow-lg flex items-center gap-2 border border-black/5">
              <span className="text-lg">📍</span>
              <span className="text-sm font-semibold">{sk.place}</span>
            </div>
          )}
          {sk.kind === "mention" && (
            <button
              type="button"
              onClick={() => onOpenProfile?.(sk.userId)}
              className="rounded-full bg-white/95 text-black px-3 py-1.5 text-sm font-bold shadow-lg border border-black/10"
            >
              @{sk.username}
            </button>
          )}
          {sk.kind === "hashtag" && (
            <div className="rounded-full bg-white/95 text-[#0095F6] px-3 py-1.5 text-sm font-bold shadow-lg border border-black/10">
              #{sk.tag.replace(/^#/, "")}
            </div>
          )}
          {sk.kind === "quiz" && (
            <QuizSticker sk={sk} storyId={story.id} meId={me.id} isOwn={isOwn} answerStoryQuiz={answerStoryQuiz} />
          )}
          {sk.kind === "slider" && (
            <SliderSticker
              sk={sk}
              storyId={story.id}
              meId={me.id}
              isOwn={isOwn}
              draft={sliderDraft[sk.id] ?? (sk.ratings?.[me.id] ?? 50)}
              setDraft={v => setSliderDraft(d => ({ ...d, [sk.id]: v }))}
              rateStorySlider={rateStorySlider}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function PollSticker({
  sk,
  storyId,
  isOwn,
  meId,
  voteStoryPoll,
}: {
  sk: Extract<StorySticker, { kind: "poll" }>;
  storyId: ID;
  isOwn: boolean;
  meId: ID;
  voteStoryPoll: (a: ID, b: ID, c: "left" | "right") => void;
}) {
  const total = sk.votesLeft.length + sk.votesRight.length;
  const lp = total ? Math.round((sk.votesLeft.length / total) * 100) : 50;
  const rp = 100 - lp;
  const mine = sk.votesLeft.includes(meId) ? "left" : sk.votesRight.includes(meId) ? "right" : null;
  return (
    <div className="rounded-2xl bg-white text-black shadow-xl overflow-hidden min-w-[11rem] max-w-[15rem] border border-black/8">
      <div className="px-3 pt-2.5 pb-2 text-sm font-semibold leading-snug">{sk.question}</div>
      <div className="flex flex-col gap-1 px-2 pb-2">
        <button
          type="button"
          disabled={isOwn}
          onClick={() => voteStoryPoll(storyId, sk.id, "left")}
          className={
            "relative rounded-xl py-2.5 px-2 text-sm font-medium overflow-hidden text-start " +
            (mine === "left" ? "ring-2 ring-[#0095F6]" : "") +
            (isOwn ? " opacity-90" : " active:scale-[0.98]")
          }
        >
          <span className="relative z-10">{sk.left}</span>
          {total > 0 && (
            <span
              className="absolute inset-0 bg-black/[0.06] origin-left transition-all"
              style={{ transform: `scaleX(${lp / 100})` }}
            />
          )}
          {total > 0 && <span className="absolute end-2 top-1/2 -translate-y-1/2 text-xs font-bold text-black/50">{lp}%</span>}
        </button>
        <button
          type="button"
          disabled={isOwn}
          onClick={() => voteStoryPoll(storyId, sk.id, "right")}
          className={
            "relative rounded-xl py-2.5 px-2 text-sm font-medium overflow-hidden text-start " +
            (mine === "right" ? "ring-2 ring-[#0095F6]" : "") +
            (isOwn ? " opacity-90" : " active:scale-[0.98]")
          }
        >
          <span className="relative z-10">{sk.right}</span>
          {total > 0 && (
            <span
              className="absolute inset-0 bg-black/[0.06] origin-left transition-all"
              style={{ transform: `scaleX(${rp / 100})` }}
            />
          )}
          {total > 0 && <span className="absolute end-2 top-1/2 -translate-y-1/2 text-xs font-bold text-black/50">{rp}%</span>}
        </button>
      </div>
    </div>
  );
}

function QuizSticker({
  sk,
  storyId,
  meId,
  isOwn,
  answerStoryQuiz,
}: {
  sk: Extract<StorySticker, { kind: "quiz" }>;
  storyId: ID;
  meId: ID;
  isOwn: boolean;
  answerStoryQuiz: (a: ID, b: ID, c: number) => void;
}) {
  const picked = sk.answers?.[meId];
  return (
    <div className="rounded-2xl bg-white text-black shadow-xl min-w-[11rem] max-w-[15rem] border border-black/8 overflow-hidden">
      <div className="px-3 pt-2.5 pb-2 text-sm font-semibold">{sk.question}</div>
      <div className="flex flex-col gap-1 px-2 pb-2">
        {sk.options.map((opt, i) => {
          const correct = i === sk.correctIndex;
          const wrongPick = picked !== undefined && picked === i && !correct;
          const rightPick = picked !== undefined && picked === i && correct;
          const showCorrect = picked !== undefined && correct;
          return (
            <button
              key={i}
              type="button"
              disabled={isOwn || picked !== undefined}
              onClick={() => answerStoryQuiz(storyId, sk.id, i)}
              className={
                "rounded-xl py-2 px-2 text-sm text-start font-medium border w-full " +
                (rightPick || showCorrect ? "bg-emerald-500/15 border-emerald-500" : "") +
                (wrongPick ? "bg-red-500/15 border-red-400" : !showCorrect && !wrongPick ? "border-transparent bg-black/[0.04]" : "")
              }
            >
              {opt}
              {picked !== undefined && <span className="float-end text-xs font-bold">{correct ? "✓" : picked === i ? "✗" : ""}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SliderSticker({
  sk,
  storyId,
  meId,
  isOwn,
  draft,
  setDraft,
  rateStorySlider,
}: {
  sk: Extract<StorySticker, { kind: "slider" }>;
  storyId: ID;
  meId: ID;
  isOwn: boolean;
  draft: number;
  setDraft: (n: number) => void;
  rateStorySlider: (a: ID, b: ID, c: number) => void;
}) {
  const vals = Object.values(sk.ratings || {});
  const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  const done = sk.ratings?.[meId] != null;

  return (
    <div className="rounded-2xl bg-white/95 text-black px-3 py-2.5 shadow-xl min-w-[10rem] max-w-[14rem] border border-black/8">
      <div className="text-center text-2xl mb-0.5">{sk.emoji}</div>
      <div className="text-xs font-semibold text-center mb-2 text-black/70">{sk.label}</div>
      {avg != null && <div className="text-center text-[11px] text-black/50 mb-1">المتوسط ≈ {avg}</div>}
      {!isOwn && !done && (
        <>
          <input
            type="range"
            min={0}
            max={100}
            value={draft}
            onChange={e => setDraft(Number(e.target.value))}
            className="w-full accent-[#0095F6]"
          />
          <button
            type="button"
            className="mt-1 w-full rounded-full bg-[#0095F6] text-white text-xs py-1.5 font-semibold"
            onClick={() => rateStorySlider(storyId, sk.id, draft)}
          >
            إرسال
          </button>
        </>
      )}
      {!isOwn && done && <div className="text-center text-xs text-emerald-600 font-semibold">تم إرسال تقييمك ({sk.ratings?.[meId]})</div>}
    </div>
  );
}
