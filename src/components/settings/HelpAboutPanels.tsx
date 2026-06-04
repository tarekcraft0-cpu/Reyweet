import { VERCEL_SITE_URL } from "@/lib/apiUrlPolicy";
import { SUPPORT_EMAIL } from "@/lib/supportContact";
import { SlideDismissBackButton } from "../SlideDismissShell";
import { ArrowRight, Mail, Shield, FileText, Smartphone } from "lucide-react";

const PRIVACY_URL = `${VERCEL_SITE_URL}/privacy.html`;
const TERMS_URL = `${VERCEL_SITE_URL}/terms.html`;

function PanelShell({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div
        dir="rtl"
        className="sticky top-0 z-[10001] flex flex-row items-center gap-3 border-b border-border bg-background px-2 py-3 pt-[max(0.5rem,var(--sat))]"
      >
        <SlideDismissBackButton
          navScope="local"
          onDismiss={onBack}
          className="shrink-0 rounded-full p-2 active:bg-accent"
          aria-label="رجوع"
        >
          <ArrowRight size={24} />
        </SlideDismissBackButton>
        <h1 className="min-w-0 flex-1 truncate text-center text-[17px] font-semibold">{title}</h1>
        <span className="w-10 shrink-0" aria-hidden />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-8 pt-2">
        {children}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-4 text-[15px] leading-relaxed text-foreground">
      {children}
    </div>
  );
}

export function HelpPanel({ onBack }: { onBack: () => void }) {
  return (
    <PanelShell title="المساعدة والدعم" onBack={onBack}>
      <Card>
        <p className="font-semibold">كيف نتواصل؟</p>
        <p className="mt-2 text-muted-foreground">
          للدعم الفني أو الإبلاغ عن مشكلة:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary underline">
            {SUPPORT_EMAIL}
          </a>
        </p>
        <ul className="mt-4 list-disc space-y-2 ps-5 text-muted-foreground">
          <li>المحادثات والرسائل: تحقق من الإنترنت ثم «استعادة البيانات من الخادم» في الإعدادات.</li>
          <li>الإشعارات: فعّلها من إعدادات iPhone → Retweet → الإشعارات.</li>
          <li>المكالمات: تحتاج إذن الميكروفون والكاميرا؛ جرّب على شبكة Wi‑Fi أولاً.</li>
          <li>حذف الحساب: الإعدادات → الخصوصية → حذف الحساب.</li>
        </ul>
      </Card>
    </PanelShell>
  );
}

export function AboutPanel({ onBack }: { onBack: () => void }) {
  const version = (import.meta as { env?: { VITE_APP_VERSION?: string } }).env?.VITE_APP_VERSION || "1.0";
  const build = (import.meta as { env?: { VITE_APP_BUILD?: string } }).env?.VITE_APP_BUILD || "dev";
  return (
    <PanelShell title="حول التطبيق" onBack={onBack}>
      <Card>
        <div className="flex items-center gap-3">
          <Smartphone className="text-primary" size={28} />
          <div>
            <p className="text-lg font-bold">Reyweet</p>
            <p className="text-sm text-muted-foreground">
              إصدار {version} · build {build}
            </p>
          </div>
        </div>
        <p className="mt-4 text-muted-foreground">
          شبكة اجتماعية للمحتوى والمحادثات والريلز — من فريق Reyweet.
        </p>
      </Card>
      <div className="mt-3 space-y-2">
        <a
          href={PRIVACY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 active:bg-accent"
        >
          <Shield size={20} className="text-primary" />
          <span className="flex-1 font-medium">سياسة الخصوصية</span>
        </a>
        <a
          href={TERMS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 active:bg-accent"
        >
          <FileText size={20} className="text-primary" />
          <span className="flex-1 font-medium">شروط الاستخدام</span>
        </a>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 active:bg-accent"
        >
          <Mail size={20} className="text-primary" />
          <span className="flex-1 font-medium">{SUPPORT_EMAIL}</span>
        </a>
      </div>
    </PanelShell>
  );
}

export function TermsPanel({ onBack }: { onBack: () => void }) {
  return (
    <PanelShell title="شروط الاستخدام" onBack={onBack}>
      <Card>
        <p className="text-muted-foreground">
          النص الكامل متوفر على الموقع. اضغط الزر أدناه لفتح الشروط في المتصفح.
        </p>
        <a
          href={TERMS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          فتح شروط الاستخدام
        </a>
      </Card>
    </PanelShell>
  );
}
