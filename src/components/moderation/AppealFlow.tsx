import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { BanInfo } from "@/lib/moderationBanTypes";
import {
  apiAppealSendOtp,
  apiAppealVerifyEmail,
  apiSubmitAppeal,
} from "@/lib/moderationApi";

type Step = "intro" | "otp" | "phone" | "message" | "submitting" | "done";

export function AppealFlow({
  banInfo,
  onBack,
  onSubmitted,
}: {
  banInfo: BanInfo;
  onBack: () => void;
  onSubmitted: () => void;
}) {
  const [step, setStep] = useState<Step>("intro");
  const [emailHint, setEmailHint] = useState("");
  const [otp, setOtp] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [err, setErr] = useState("");

  const sendOtp = async () => {
    setErr("");
    const r = await apiAppealSendOtp();
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setEmailHint(r.data.emailHint);
    setStep("otp");
  };

  const verifyOtp = async () => {
    setErr("");
    const r = await apiAppealVerifyEmail(otp);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setEmailVerified(true);
    setStep("phone");
  };

  const submit = async () => {
    if (message.trim().length < 10) {
      setErr("اكتب رسالة الطعن (10 أحرف على الأقل)");
      return;
    }
    setStep("submitting");
    const r = await apiSubmitAppeal({
      message: message.trim(),
      phone: phone.trim() || undefined,
      emailVerified: true,
    });
    if (!r.ok) {
      setErr(r.error);
      setStep("message");
      return;
    }
    setStep("done");
    window.setTimeout(onSubmitted, 700);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button type="button" onClick={onBack} className="rounded-full p-2 hover:bg-secondary">
          <ArrowRight size={20} className="rtl:rotate-180" />
        </button>
        <h1 className="flex-1 text-center font-semibold">طعن على الحظر</h1>
      </div>
      <div className="flex-1 px-6 py-6 max-w-md mx-auto w-full">
        {step === "intro" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              سنتحقق من بريدك المرتبط بـ @{banInfo.username} قبل قبول الطعن.
            </p>
            <button
              type="button"
              onClick={() => void sendOtp()}
              className="w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground"
            >
              التحقق من البريد
            </button>
          </div>
        )}
        {step === "otp" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">أدخل الرمز المرسل إلى {emailHint}</p>
            <input
              value={otp}
              onChange={e => setOtp(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3 py-3 text-center text-lg tracking-widest"
              inputMode="numeric"
            />
            {err && <p className="text-sm text-destructive">{err}</p>}
            <button
              type="button"
              onClick={() => void verifyOtp()}
              className="w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground"
            >
              تأكيد
            </button>
          </div>
        )}
        {step === "phone" && emailVerified && (
          <div className="space-y-4">
            <label className="block text-sm">
              رقم الجوال (اختياري)
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2"
              />
            </label>
            <button
              type="button"
              onClick={() => setStep("message")}
              className="w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground"
            >
              التالي
            </button>
          </div>
        )}
        {step === "message" && (
          <div className="space-y-4">
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={6}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
              placeholder="اشرح لماذا يجب إعادة تفعيل حسابك…"
            />
            {err && <p className="text-sm text-destructive">{err}</p>}
            <button
              type="button"
              onClick={() => void submit()}
              className="w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground"
            >
              إرسال الطعن
            </button>
          </div>
        )}
        {step === "done" && (
          <div className="text-center py-8">
            <p className="font-semibold">تم استلام طعنك</p>
            <p className="mt-2 text-sm text-muted-foreground">سنراجعه ونُبلغك بالنتيجة.</p>
            <button type="button" onClick={onBack} className="mt-8 text-primary text-sm font-semibold">
              رجوع
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
