import { useState, type ComponentType, type ReactNode } from "react";
import { useApp } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { ArrowRight, Lock, Moon, Sun, Globe, Bell, Key, HelpCircle, Info, LogOut, Eye, MessageCircleOff, Heart, UsersRound } from "lucide-react";
import { VerifiedBadge, VerifiedMarkForUser } from "../VerifiedBadge";

export function SettingsScreen({ onBack }: { onBack: () => void; onAccountInfo?: () => void }) {
  const { state, setState, currentUser, logout, updateProfile, toggleBlock, changeOwnPassword } = useApp();
  const t = useT();
  const me = currentUser!;
  const [showPwd, setShowPwd] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [oldP, setOldP] = useState("");
  const [newP, setNewP] = useState("");
  const blockedUsers = state.users.filter(u => me.blocked.includes(u.id));

  const setTheme = (th: "light" | "dark") => setState(s => ({ ...s, theme: th }));
  const togglePrivate = () => updateProfile({ isPrivate: !me.isPrivate });
  const setLang = (l: "ar" | "en") => setState(s => ({ ...s, language: l }));

  const changePwd = async () => {
    const r = await changeOwnPassword(oldP, newP);
    if (!r.ok) {
      alert(r.error || "تعذر التغيير");
      return;
    }
    alert("تم تغيير الباسورد");
    setShowPwd(false);
    setOldP("");
    setNewP("");
  };

  const rowClass = "w-full flex items-center gap-3 p-3 hover:bg-secondary rounded-2xl text-start";
  const Row = ({
    icon: Icon,
    label,
    right,
    onClick,
  }: {
    icon: ComponentType<{ size?: number; className?: string }>;
    label: string;
    right?: ReactNode;
    onClick?: () => void;
  }) => {
    const inner = (
      <>
        <Icon size={20} className="text-primary shrink-0" />
        <span className="flex-1 text-sm">{label}</span>
        {right}
      </>
    );
    if (onClick) {
      return (
        <button type="button" onClick={onClick} className={rowClass}>
          {inner}
        </button>
      );
    }
    return <div className={rowClass}>{inner}</div>;
  };

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack}><ArrowRight /></button>
        <h2 className="font-bold">{t("settings")}</h2>
        <span />
      </div>

      <section>
        <h3 className="text-xs text-muted-foreground mb-2 px-1">{t("preferences")}</h3>
        <div className="bg-card rounded-2xl divide-y divide-border">
          <Row icon={state.theme === "dark" ? Moon : Sun} label={t("darkMode")} right={
            <button type="button" onClick={() => setTheme(state.theme === "dark" ? "light" : "dark")} className={"w-12 h-7 rounded-full p-1 " + (state.theme === "dark" ? "bg-primary" : "bg-muted")}>
              <div className={"w-5 h-5 bg-background rounded-full transition-transform " + (state.theme === "dark" ? "translate-x-5 rtl:-translate-x-5" : "")} />
            </button>
          } />
          <Row icon={Globe} label={t("language")} right={
            <select value={state.language} onChange={e => setLang(e.target.value as "ar" | "en")} className="bg-transparent text-sm">
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          } />
          <Row icon={Bell} label={t("notifications")} />
        </div>
      </section>

      <section>
        <h3 className="text-xs text-muted-foreground mb-2 px-1">الحساب</h3>
        <div className="bg-card rounded-2xl divide-y divide-border">
          {me.verified ? (
            <div className="w-full flex items-center gap-3 p-3 rounded-2xl text-start">
              <VerifiedMarkForUser user={me} size={22} />
              <span className="flex-1 text-sm">حسابك موثّق</span>
              <span className="text-xs text-muted-foreground">✓</span>
            </div>
          ) : (
            <Row
              icon={VerifiedBadge}
              label="توثيق الحساب"
              onClick={() => setVerifyOpen(o => !o)}
            />
          )}
        </div>
        {verifyOpen && !me.verified && (
          <div className="mt-2 bg-card rounded-2xl p-4 border border-border space-y-3 text-sm">
            <p className="text-muted-foreground text-xs leading-relaxed">
              راجع أن معلومات حسابك صحيحة، ثم اضغط تأكيد لإكمال التوثيق.
            </p>
            <div className="space-y-1 text-xs bg-secondary/50 rounded-xl p-3">
              <div><span className="text-muted-foreground">اليوزر:</span> @{me.username}</div>
              <div><span className="text-muted-foreground">البريد:</span> {me.email}</div>
            </div>
            <button
              type="button"
              className="w-full bg-primary text-primary-foreground rounded-xl py-2.5 font-semibold"
              onClick={() => {
                updateProfile({ verified: true });
                setVerifyOpen(false);
              }}
            >
              تأكيد
            </button>
          </div>
        )}
      </section>

      <section>
        <h3 className="text-xs text-muted-foreground mb-2 px-1">{t("privacy")}</h3>
        <div className="bg-card rounded-2xl divide-y divide-border">
          <Row icon={Lock} label={t("private")} right={
            <button type="button" onClick={togglePrivate} className={"w-12 h-7 rounded-full p-1 " + (me.isPrivate ? "bg-primary" : "bg-muted")}>
              <div className={"w-5 h-5 bg-background rounded-full transition-transform " + (me.isPrivate ? "translate-x-5 rtl:-translate-x-5" : "")} />
            </button>
          } />
          <div className="w-full flex items-center gap-3 p-3 hover:bg-secondary rounded-2xl text-start">
            <MessageCircleOff size={20} className="text-primary shrink-0" />
            <span className="flex-1 text-sm">السماح بالرد على ستورياتي</span>
            <button
              type="button"
              onClick={() => updateProfile({ allowStoryReplies: me.allowStoryReplies === false })}
              className={"w-12 h-7 rounded-full p-1 shrink-0 " + (me.allowStoryReplies !== false ? "bg-primary" : "bg-muted")}
            >
              <div className={"w-5 h-5 bg-background rounded-full transition-transform " + (me.allowStoryReplies !== false ? "translate-x-5 rtl:-translate-x-5" : "")} />
            </button>
          </div>
          <div className="w-full flex items-center gap-3 p-3 hover:bg-secondary rounded-2xl text-start">
            <Heart size={20} className="text-primary shrink-0" />
            <span className="flex-1 text-sm">إظهار الإعجابات والمحفوظات في ملفي للزوار</span>
            <button
              type="button"
              onClick={() => {
                const v = me.showLikesAndFavoritesOnProfile !== false;
                updateProfile({ showLikesAndFavoritesOnProfile: !v });
              }}
              className={"w-12 h-7 rounded-full p-1 shrink-0 " + (me.showLikesAndFavoritesOnProfile !== false ? "bg-primary" : "bg-muted")}
            >
              <div className={"w-5 h-5 bg-background rounded-full transition-transform " + (me.showLikesAndFavoritesOnProfile !== false ? "translate-x-5 rtl:-translate-x-5" : "")} />
            </button>
          </div>
          <div className="w-full flex items-center gap-3 p-3 hover:bg-secondary rounded-2xl text-start">
            <UsersRound size={20} className="text-primary shrink-0" />
            <span className="flex-1 text-sm">إخفاء المتابعين والمتابَعين عن الزوار</span>
            <button
              type="button"
              onClick={() => updateProfile({ hideFollowListsFromOthers: !me.hideFollowListsFromOthers })}
              className={"w-12 h-7 rounded-full p-1 shrink-0 " + (me.hideFollowListsFromOthers ? "bg-primary" : "bg-muted")}
            >
              <div className={"w-5 h-5 bg-background rounded-full transition-transform " + (me.hideFollowListsFromOthers ? "translate-x-5 rtl:-translate-x-5" : "")} />
            </button>
          </div>
          <Row icon={Eye} label={t("accountInfo")} onClick={() => setShowInfo(s => !s)} />
          <Row icon={Key} label={t("changePwd")} onClick={() => setShowPwd(s => !s)} />
        </div>
        {showInfo && (
          <div className="mt-2 bg-card rounded-2xl p-3 text-sm space-y-1">
            <div>@{me.username}</div>
            <div>{me.email}</div>
            <div className="text-muted-foreground text-xs">{me.id}</div>
          </div>
        )}
        {showPwd && (
          <div className="mt-2 bg-card rounded-2xl p-3 space-y-2">
            <input value={oldP} onChange={e => setOldP(e.target.value)} type="password" placeholder="الحالي" className="w-full bg-input rounded-xl px-3 py-2" />
            <input value={newP} onChange={e => setNewP(e.target.value)} type="password" placeholder="الجديد" className="w-full bg-input rounded-xl px-3 py-2" />
            <button type="button" onClick={changePwd} className="w-full bg-primary text-primary-foreground rounded-xl py-2 font-semibold">{t("save")}</button>
          </div>
        )}
      </section>

      <section>
        <h3 className="text-xs text-muted-foreground mb-2 px-1">الحسابات المحظورة</h3>
        <div className="bg-card rounded-2xl divide-y divide-border">
          {blockedUsers.map(u => (
            <div key={u.id} className="w-full flex items-center gap-3 p-3 text-start">
              <span className="flex-1 text-sm">@{u.username}</span>
              <button type="button" onClick={() => toggleBlock(u.id)} className="text-xs bg-secondary px-3 py-1 rounded-full">فك الحظر</button>
            </div>
          ))}
          {blockedUsers.length === 0 && <div className="p-3 text-sm text-muted-foreground">لا يوجد حسابات محظورة</div>}
        </div>
      </section>

      <section>
        <h3 className="text-xs text-muted-foreground mb-2 px-1">{t("support")}</h3>
        <div className="bg-card rounded-2xl divide-y divide-border">
          <Row icon={HelpCircle} label={t("help")} />
          <Row icon={Info} label={t("about")} />
        </div>
      </section>

      <button type="button" onClick={() => { logout(); onBack(); }} className="w-full bg-card text-destructive font-semibold py-3 rounded-2xl flex items-center justify-center gap-2">
        <LogOut size={18} /> {t("logout")}
      </button>
    </div>
  );
}
