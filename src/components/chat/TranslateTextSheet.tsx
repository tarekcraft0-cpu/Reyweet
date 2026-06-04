import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { translateText } from "@/lib/translateText";

export function TranslateTextSheet({
  sourceText,
  onClose,
}: {
  sourceText: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [translated, setTranslated] = useState("");
  const [error, setError] = useState("");
  const [targetLang, setTargetLang] = useState<"ar" | "en">("en");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      const r = await translateText(sourceText, "auto");
      if (cancelled) return;
      setLoading(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setTranslated(r.text);
      setTargetLang(r.targetLang);
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceText]);

  return (
    <div className="fixed inset-0 z-[420] flex items-end justify-center bg-black/50 p-3 sm:items-center" dir="rtl">
      <button type="button" className="absolute inset-0" aria-label="إغلاق" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">ترجمة</h2>
          <button
            type="button"
            className="rounded-full p-2 hover:bg-accent"
            aria-label="إغلاق"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">النص الأصلي</p>
        <p className="mb-4 max-h-32 overflow-y-auto whitespace-pre-wrap text-sm text-foreground">{sourceText}</p>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {targetLang === "ar" ? "بالعربية" : "بالإنجليزية"}
        </p>
        {loading ? (
          <p className="text-sm text-muted-foreground">جاري الترجمة…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm font-medium text-foreground">
            {translated}
          </p>
        )}
        {!loading && !error && translated ? (
          <button
            type="button"
            className="mt-4 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
            onClick={() => {
              void navigator.clipboard.writeText(translated).catch(() => undefined);
            }}
          >
            نسخ الترجمة
          </button>
        ) : null}
      </div>
    </div>
  );
}
