import { getAccountSession } from "@/lib/accountSessions";
import { useApp, userById } from "@/lib/store";
import { isGuestUserId } from "@/lib/guestUser";
import { useT } from "@/lib/i18n";
import { displayNameFromUsername } from "@/lib/rsocialUi";
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
    <div
      dir="rtl"
      className="fixed inset-0 z-[200] flex flex-col pointer-events-auto bg-zinc-100 dark:bg-zinc-950"
      onClick={onClose}
    >
      <div
        className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-8"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-6 flex flex-row items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-2 text-zinc-900 active:bg-zinc-200 dark:text-zinc-50 dark:active:bg-zinc-800"
            aria-label={t("cancel")}
          >
            <ArrowRight size={22} strokeWidth={1.75} />
          </button>
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

        {state.accountIds.filter(id => !isGuestUserId(id) && id !== currentUser.id).length > 0 && (
          <>
            <p className="mb-2 px-1 text-start text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {t("activeAccountsAdd")}
            </p>
            <div className="mb-5 divide-y divide-zinc-100 overflow-hidden rounded-[20px] border border-zinc-200/60 bg-white shadow-sm dark:divide-zinc-800 dark:border-zinc-700 dark:bg-zinc-900">
              {state.accountIds
                .filter(id => !isGuestUserId(id) && id !== currentUser.id)
                .map(id => {
                  const u = userById(state, id);
                  if (!u) return null;
                  const sess = getAccountSession(id);
                  const displayUsername = sess?.username ?? u.username;
                  const displayAvatar = sess?.avatar ?? u.avatar;
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
                      className="flex w-full flex-row items-center gap-3 p-4 text-start disabled:opacity-60 active:bg-zinc-50 dark:active:bg-zinc-800/80"
                    >
                      <RSocialAvatar name={displayUsername} src={displayAvatar} size={48} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold text-zinc-900 dark:text-zinc-50">
                          {displayNameFromUsername(displayUsername)}
                        </div>
                        <div className="truncate text-sm text-zinc-500 dark:text-zinc-400">@{displayUsername}</div>
                      </div>
                      {switching && <span className="shrink-0 text-xs text-zinc-400">…</span>}
                    </button>
                  );
                })}
            </div>
          </>
        )}

        <button
          type="button"
          onClick={onAddAccount}
          className="flex w-full flex-row items-center gap-3 rounded-[20px] border border-zinc-200/60 bg-white p-4 text-start font-semibold text-[#0A84FF] shadow-sm active:scale-[0.99] dark:border-zinc-700 dark:bg-zinc-900"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0A84FF] text-xl leading-none text-white">
            +
          </span>
          {t("activeAccountsAdd")}
        </button>
      </div>
    </div>
  );
}
