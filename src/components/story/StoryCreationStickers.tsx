import { useState, type ReactNode } from "react";
import { useApp } from "@/lib/store";
import type { StorySticker } from "@/lib/types";
import {
  BarChart2,
  HelpCircle,
  Clock,
  MapPin,
  AtSign,
  Hash,
  ListOrdered,
  SlidersHorizontal,
  X,
} from "lucide-react";

const nid = () => Math.random().toString(36).slice(2, 11);

function nextPlacement(index: number) {
  return {
    x: 40 + (index % 4) * 7,
    y: 26 + (index % 5) * 10,
    rotation: index % 2 === 0 ? -4 : 4,
  };
}

function TrayBtn({ icon: Icon, label, onClick }: { icon: typeof BarChart2; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 shrink-0 min-w-[3.25rem] text-white/90 active:scale-95"
    >
      <span className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center border border-white/15">
        <Icon size={22} strokeWidth={1.75} />
      </span>
      <span className="text-[9px] font-medium leading-tight text-center max-w-[4.2rem]">{label}</span>
    </button>
  );
}

export function StoryCreationStickers({
  stickers,
  setStickers,
}: {
  stickers: StorySticker[];
  setStickers: React.Dispatch<React.SetStateAction<StorySticker[]>>;
}) {
  const { state, currentUser } = useApp();
  const me = currentUser!;
  const [sheet, setSheet] = useState<StorySticker["kind"] | null>(null);

  const push = (st: StorySticker) => {
    setStickers(prev => [...prev, st]);
    setSheet(null);
  };

  const idx = stickers.length;
  const p = nextPlacement(idx);

  /* ——— form drafts ——— */
  const [poll, setPoll] = useState({ q: "", left: "نعم", right: "لا" });
  const [question, setQuestion] = useState({ prompt: "وش تبي تسأل؟" });
  const [countdown, setCountdown] = useState({ title: "العد التنازلي", when: "" });
  const [location, setLocation] = useState({ place: "الرياض" });
  const [mention, setMention] = useState({ userId: "" });
  const [hashtag, setHashtag] = useState({ tag: "ستوري" });
  const [quiz, setQuiz] = useState({ question: "", o0: "", o1: "", o2: "", o3: "", correct: 0 });
  const [slider, setSlider] = useState({ emoji: "❤️", label: "مودك؟" });

  const mentionChoices = state.users.filter(u => u.id !== me.id).slice(0, 40);

  let sheetBody: ReactNode = null;
  if (sheet === "poll") {
    sheetBody = (
      <div className="space-y-2">
        <input value={poll.q} onChange={e => setPoll(s => ({ ...s, q: e.target.value }))} placeholder="سؤال الاستطلاع" className="w-full bg-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none" />
        <input value={poll.left} onChange={e => setPoll(s => ({ ...s, left: e.target.value }))} placeholder="خيار ١" className="w-full bg-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none" />
        <input value={poll.right} onChange={e => setPoll(s => ({ ...s, right: e.target.value }))} placeholder="خيار ٢" className="w-full bg-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none" />
        <button
          type="button"
          className="w-full bg-[#0095F6] text-white rounded-xl py-2.5 font-semibold text-sm"
          onClick={() => {
            if (!poll.q.trim()) return;
            push({
              id: nid(),
              kind: "poll",
              ...p,
              question: poll.q.trim(),
              left: poll.left.trim() || "١",
              right: poll.right.trim() || "٢",
              votesLeft: [],
              votesRight: [],
            });
          }}
        >
          إضافة الاستطلاع
        </button>
      </div>
    );
  } else if (sheet === "question") {
    sheetBody = (
      <div className="space-y-2">
        <textarea value={question.prompt} onChange={e => setQuestion({ prompt: e.target.value })} rows={3} className="w-full bg-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none resize-none" />
        <button type="button" className="w-full bg-[#0095F6] text-white rounded-xl py-2.5 font-semibold text-sm" onClick={() => question.prompt.trim() && push({ id: nid(), kind: "question", ...p, prompt: question.prompt.trim() })}>
          إضافة السؤال
        </button>
      </div>
    );
  } else if (sheet === "countdown") {
    sheetBody = (
      <div className="space-y-2">
        <input value={countdown.title} onChange={e => setCountdown(s => ({ ...s, title: e.target.value }))} className="w-full bg-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none" />
        <input type="datetime-local" value={countdown.when} onChange={e => setCountdown(s => ({ ...s, when: e.target.value }))} className="w-full bg-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none" />
        <button
          type="button"
          className="w-full bg-[#0095F6] text-white rounded-xl py-2.5 font-semibold text-sm"
          onClick={() => {
            const t = countdown.when ? new Date(countdown.when).getTime() : Date.now() + 3600000;
            push({ id: nid(), kind: "countdown", ...p, title: countdown.title.trim() || "العد التنازلي", targetAt: t });
          }}
        >
          إضافة العد التنازلي
        </button>
      </div>
    );
  } else if (sheet === "location") {
    sheetBody = (
      <div className="space-y-2">
        <input value={location.place} onChange={e => setLocation({ place: e.target.value })} placeholder="اسم المكان" className="w-full bg-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none" />
        <button type="button" className="w-full bg-[#0095F6] text-white rounded-xl py-2.5 font-semibold text-sm" onClick={() => location.place.trim() && push({ id: nid(), kind: "location", ...p, place: location.place.trim() })}>
          إضافة الموقع
        </button>
      </div>
    );
  } else if (sheet === "mention") {
    sheetBody = (
      <div className="space-y-2 max-h-48 overflow-y-auto">
        <select value={mention.userId} onChange={e => setMention({ userId: e.target.value })} className="w-full bg-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none">
          <option value="">— اختر حساباً —</option>
          {mentionChoices.map(u => (
            <option key={u.id} value={u.id}>
              @{u.username}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="w-full bg-[#0095F6] text-white rounded-xl py-2.5 font-semibold text-sm"
          onClick={() => {
            const u = state.users.find(x => x.id === mention.userId);
            if (!u) return;
            push({ id: nid(), kind: "mention", ...p, userId: u.id, username: u.username });
          }}
        >
          إضافة المنشن
        </button>
      </div>
    );
  } else if (sheet === "hashtag") {
    sheetBody = (
      <div className="space-y-2">
        <input value={hashtag.tag} onChange={e => setHashtag({ tag: e.target.value })} placeholder="بدون #" className="w-full bg-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none" />
        <button type="button" className="w-full bg-[#0095F6] text-white rounded-xl py-2.5 font-semibold text-sm" onClick={() => hashtag.tag.trim() && push({ id: nid(), kind: "hashtag", ...p, tag: hashtag.tag.trim() })}>
          إضافة الهاشتاق
        </button>
      </div>
    );
  } else if (sheet === "quiz") {
    sheetBody = (
      <div className="space-y-2">
        <input value={quiz.question} onChange={e => setQuiz(s => ({ ...s, question: e.target.value }))} className="w-full bg-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none" />
        <input value={quiz.o0} onChange={e => setQuiz(s => ({ ...s, o0: e.target.value }))} placeholder="خيار ١" className="w-full bg-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none" />
        <input value={quiz.o1} onChange={e => setQuiz(s => ({ ...s, o1: e.target.value }))} placeholder="خيار ٢" className="w-full bg-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none" />
        <input value={quiz.o2} onChange={e => setQuiz(s => ({ ...s, o2: e.target.value }))} placeholder="خيار ٣ (اختياري)" className="w-full bg-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none" />
        <input value={quiz.o3} onChange={e => setQuiz(s => ({ ...s, o3: e.target.value }))} placeholder="خيار ٤ (اختياري)" className="w-full bg-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none" />
        <label className="text-xs text-white/70 flex items-center gap-2">
          الإجابة الصحيحة (رقم الخيار ١–٤)
          <select value={quiz.correct} onChange={e => setQuiz(s => ({ ...s, correct: Number(e.target.value) }))} className="bg-zinc-800 rounded-lg px-2 py-1 text-sm">
            {[0, 1, 2, 3].map(i => (
              <option key={i} value={i}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="w-full bg-[#0095F6] text-white rounded-xl py-2.5 font-semibold text-sm"
          onClick={() => {
            const opts = [quiz.o0, quiz.o1, quiz.o2, quiz.o3].map(s => s.trim()).filter(Boolean);
            if (opts.length < 2 || !quiz.question.trim()) return;
            push({
              id: nid(),
              kind: "quiz",
              ...p,
              question: quiz.question.trim(),
              options: opts,
              correctIndex: Math.min(quiz.correct, opts.length - 1),
            });
          }}
        >
          إضافة الاختبار
        </button>
      </div>
    );
  } else if (sheet === "slider") {
    sheetBody = (
      <div className="space-y-2">
        <input value={slider.emoji} onChange={e => setSlider(s => ({ ...s, emoji: e.target.value }))} className="w-full bg-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none" placeholder="إيموجي" />
        <input value={slider.label} onChange={e => setSlider(s => ({ ...s, label: e.target.value }))} className="w-full bg-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none" />
        <button type="button" className="w-full bg-[#0095F6] text-white rounded-xl py-2.5 font-semibold text-sm" onClick={() => slider.label.trim() && push({ id: nid(), kind: "slider", ...p, emoji: slider.emoji || "❤️", label: slider.label.trim() })}>
          إضافة المنزلق
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-[1.75rem] bg-zinc-950/95 border border-white/12 px-2 py-3 shadow-inner">
        <p className="text-[10px] text-white/50 text-center mb-2 px-1">ملصقات ستوري — مثل إنستغرام</p>
        <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
          <TrayBtn icon={BarChart2} label="استطلاع" onClick={() => setSheet("poll")} />
          <TrayBtn icon={HelpCircle} label="سؤال" onClick={() => setSheet("question")} />
          <TrayBtn icon={Clock} label="عدّ تنازلي" onClick={() => setSheet("countdown")} />
          <TrayBtn icon={MapPin} label="موقع" onClick={() => setSheet("location")} />
          <TrayBtn icon={AtSign} label="منشن" onClick={() => setSheet("mention")} />
          <TrayBtn icon={Hash} label="هاشتاق" onClick={() => setSheet("hashtag")} />
          <TrayBtn icon={ListOrdered} label="اختبار" onClick={() => setSheet("quiz")} />
          <TrayBtn icon={SlidersHorizontal} label="منزلق" onClick={() => setSheet("slider")} />
        </div>
        {stickers.length > 0 && (
          <button type="button" className="w-full mt-2 text-xs text-red-300 py-1" onClick={() => setStickers([])}>
            مسح كل الملصقات ({stickers.length})
          </button>
        )}
      </div>

      {sheet && (
        <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/60" onClick={() => setSheet(null)}>
          <div className="w-full max-w-md bg-zinc-900 rounded-t-3xl p-4 border-t border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white text-sm">إضافة ملصق</h3>
              <button type="button" className="p-2 rounded-full hover:bg-white/10 text-white" onClick={() => setSheet(null)} aria-label="إغلاق">
                <X size={20} />
              </button>
            </div>
            {sheetBody}
          </div>
        </div>
      )}
    </>
  );
}
