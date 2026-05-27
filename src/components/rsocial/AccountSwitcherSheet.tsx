import { getAccountSession, listAccountSessions } from "@/lib/accountSessions";
import { useApp } from "@/lib/store";
import { isGuestUserId } from "@/lib/guestUser";
import { useT } from "@/lib/i18n";
import { displayNameFromUsername } from "@/lib/rsocialUi";
import { AppDismissSheet, SlideDismissBackButton } from "../SlideDismissShell";
import { RSocialAvatar } from "./RSocialAvatar";
import { ArrowRight } from "lucide-react";

type Props = {
  switchingAccountId: string | null;
  onSwitching: (id: string | null) => void;
  onClose: () => void;
  onAddAccount: () => void;
};

export function AccountSwitcherSheet({ switchingAccountId, onSwitching, onClose, onAddAccount }: Props) {
  const { state, currentUser, switchAccount } = useApp();
  const t = useT();

  return (
    <AppDismissSheet onClose={onClose} overlayZIndex={200} contentClassName="bg-zinc-100 dark:bg-zinc-950">
      <div
        dir="rtl"
        className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))]"
      >
        <div className="mb-6 flex flex-row items-center gap-3">
          <SlideDismissBackButton
            onDismiss={onClose}
            className="shrink-0 rounded-full p-2 text-zinc-900 active:bg-zinc-200 dark:text-zinc-50 dark:active:bg-zinc-800"
            aria-label={t("cancel")}
          >
            <ArrowRight size={22} strokeWidth={1.75} />
          </SlideDismissBackButton>
          <h2 className="min-w-0 flex-1 text-center text-base font-bold text-zinc-900 dark:text-zinc-50">
            {t("activeAccountsAdd")}
          </h2>
          <span className="w-10 shrink-0" aria-hidden />
        </div>

        <p className="mb-2 px-1 text-start text-xs font-medium text-zinc-500 dark:text-zinc-400">{t("accountInfo")}</p>
        <div className="mb-5 overflow-hidden rounded-[20px] border border-zinc-200/60 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex flex-row items-center gap-3 p-4 text-start">
            <RSocialAvatar name={currentUser.username} src={currentUser.avatar} size={48} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold text-zinc-900 dark:text-zinc-50">
                {displayNameFromUsername(currentUser.username)}
              </div>
              <div className="truncate text-sm text-zinc-500 dark:text-zinc-400">@{currentUser.username}</div>
            </div>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0A84FF] text-sm text-white">
              ✓
            </span>
          </div>
        </div>

        {(() => {
          const seenCheck = new Set<string>();
          return listAccountSessions().filter(s => {
            if (isGuestUserId(s.userId) || s.userId === currentUser.id) return false;
            if (seenCheck.has(s.userId) || seenCheck.has(s.username.toLowerCase())) return false;
            seenCheck.add(s.userId);
            seenCheck.add(s.username.toLowerCase());
            return true;
          }).length > 0;
        })() && (
          <>
            <p className="mb-2 px-1 text-start text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {t("activeAccountsAdd")}
            </p>
            <div className="mb-5 divide-y divide-zinc-100 overflow-hidden rounded-[20px] border border-zinc-200/60 bg-white shadow-sm dark:divide-zinc-800 dark:border-zinc-700 dark:bg-zinc-900">
        {(() => {
          const seen = new Set<string>();
          return listAccountSessions()
            .filter(s => {
              if (isGuestUserId(s.userId)) return false;
              if (s.userId === currentUser.id) return false;
              // إلغاء التكرار: نفس الـ userId أو نفس الـ username
              const key = s.userId + "|" + s.username.toLowerCase();
              if (seen.has(s.userId) || seen.has(s.username.toLowerCase())) return false;
              seen.add(s.userId);
              seen.add(s.username.toLowerCase());
              return true;
            });
        })().map(sess => {
                  const id = sess.userId;
                  const displayUsername = sess.username;
                  const displayAvatar = sess.avatar;
                  const switching = switchingAccountId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={!!switchingAccountId}
                      onClick={() => {
                        void (async () => {
                          onSwitching(id);
                          try {
                            await switchAccount(id);
                            onClose();
                          } finally {
                            onSwitching(null);
                          }
                        })();
                      }}
                      className="flex w-full flex-row items-center gap-3 p-4 text-start transition-colors active:bg-zinc-100 disabled:opacity-60 dark:active:bg-zinc-800"
                    >
                      <RSocialAvatar name={displayUsername} src={displayAvatar} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-zinc-900 dark:text-zinc-50">
                          {displayNameFromUsername(displayUsername)}
                        </div>
                        <div className="truncate text-sm text-zinc-500 dark:text-zinc-400">@{displayUsername}</div>
                      </div>
                      {switching && (
                        <span className="shrink-0 text-xs text-zinc-500">{t("switchingAccount")}</span>
                      )}
                    </button>
                  );
                })}
            </div>
          </>
        )}

        <button
          type="button"
          onClick={onAddAccount}
          className="w-full rounded-[20px] border border-dashed border-zinc-300 bg-white py-4 text-sm font-semibold text-[#0A84FF] dark:border-zinc-600 dark:bg-zinc-900"
        >
          {t("addAccount")}
        </button>
      </div>
    </AppDismissSheet>
  );
}
