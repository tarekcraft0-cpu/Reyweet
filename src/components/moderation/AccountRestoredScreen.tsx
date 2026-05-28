export function AccountRestoredScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-center">
      <div className="mb-5 flex h-28 w-28 items-center justify-center rounded-full border-4 border-emerald-500/40 bg-emerald-500/15 text-emerald-500">
        <span className="text-6xl leading-none">✓</span>
      </div>
      <h1 className="text-2xl font-extrabold">تمت استعادة حسابك</h1>
      <p className="mt-2 text-sm text-muted-foreground">تم قبول الطعن. يمكنك الآن استخدام الحساب بشكل طبيعي.</p>
      <button
        type="button"
        onClick={onContinue}
        className="mt-8 w-full max-w-sm rounded-xl bg-primary py-3 font-semibold text-primary-foreground"
      >
        متابعة
      </button>
    </div>
  );
}
