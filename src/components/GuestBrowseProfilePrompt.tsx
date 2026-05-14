/** شاشة تبويب البروفايل لمستخدم «تصفّح بدون حساب» */
export function GuestBrowseProfilePrompt({ onGoLogin }: { onGoLogin: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-8" dir="rtl">
      <div className="w-full max-w-sm space-y-4 rounded-3xl border border-border bg-card p-8 shadow-sm">
        <p className="text-center text-4xl" aria-hidden>
          👀
        </p>
        <h2 className="text-center text-xl font-bold">أنت تتصفّح بدون حساب</h2>
        <p className="text-start text-sm leading-relaxed text-muted-foreground">
          يمكنك تصفّح المنشورات و<strong>مشاهدة الريلز</strong> فقط. لا يمكن الإعجاب أو التعليق أو إعادة النشر أو المشاركة أو مراسلة أحد أو المتابعة حتى تسجّل الدخول أو تنشئ حساباً.
        </p>
        <button
          type="button"
          onClick={onGoLogin}
          className="min-h-[48px] w-full touch-manipulation rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
        >
          تسجيل الدخول أو إنشاء حساب
        </button>
      </div>
    </div>
  );
}
