import { useState } from "react";
import { Crown, Shield, ShieldCheck, User } from "lucide-react";
import type { Chat, ID } from "@/lib/types";
import type { GroupRole } from "@/lib/groupTypes";
import { canGroup, resolveGroupRole } from "@/lib/groupRbac";
import { apiSetGroupMemberRole } from "@/lib/groupApi";
import { apiBackendEnabled } from "@/lib/apiBackend";
import { Avatar } from "../Avatar";
import { userById, useApp } from "@/lib/store";

const ROLE_LABEL: Record<GroupRole, string> = {
  owner: "مالك",
  admin: "مشرف",
  moderator: "مراقب",
  member: "عضو",
};

const ROLE_ICON: Record<GroupRole, typeof Crown> = {
  owner: Crown,
  admin: ShieldCheck,
  moderator: Shield,
  member: User,
};

export function GroupRolesSheet({
  chat,
  onClose,
  onChatUpdated,
}: {
  chat: Chat;
  onClose: () => void;
  onChatUpdated?: (chat: Chat) => void;
}) {
  const { state, currentUser, setState } = useApp();
  const me = currentUser!;
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const canAssignAdmin = canGroup(chat, me.id, "roles.assign_admin");
  const canDemote = canGroup(chat, me.id, "roles.demote_any_admin");

  const applyLocalRole = (userId: ID, role: GroupRole) => {
    const memberRoles = { ...(chat.memberRoles || {}), [userId]: role };
    const admins = chat.members.filter(
      id => memberRoles[id] === "owner" || memberRoles[id] === "admin",
    );
    let ownerId = chat.ownerId;
    if (role === "owner") ownerId = userId;
    const next: Chat = { ...chat, memberRoles, admins, ownerId };
    setState(s => ({
      ...s,
      chats: s.chats.map(c => (c.id === chat.id ? next : c)),
    }));
    onChatUpdated?.(next);
  };

  const setRole = async (userId: ID, role: GroupRole) => {
    setErr("");
    setBusy(userId);
    try {
      if (apiBackendEnabled()) {
        const res = await apiSetGroupMemberRole(chat.id, userId, role);
        if (!res.ok) {
          setErr(res.error);
          return;
        }
        if (res.data.chat) {
          setState(s => ({
            ...s,
            chats: s.chats.map(c => (c.id === chat.id ? res.data.chat! : c)),
          }));
          onChatUpdated?.(res.data.chat);
        }
      } else {
        applyLocalRole(userId, role);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[220] flex flex-col justify-end bg-black/50" onClick={onClose}>
      <div
        className="mx-auto flex max-h-[min(85vh,640px)] w-full max-w-md flex-col rounded-t-3xl bg-background animate-in slide-in-from-bottom"
        onClick={e => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-center font-semibold">الأدوار والصلاحيات</h2>
          <p className="mt-1 text-center text-xs text-muted-foreground">
            مثل Instagram — المالك يتحكم بكل شيء
          </p>
        </div>
        {err && (
          <p className="px-4 py-2 text-center text-sm text-destructive">{err}</p>
        )}
        <ul className="flex-1 overflow-y-auto no-scrollbar px-2 py-2">
          {chat.members.map(id => {
            const u = userById(state, id);
            if (!u) return null;
            const role = resolveGroupRole(chat, id) || "member";
            const Icon = ROLE_ICON[role];
            const isMe = id === me.id;
            const canEdit =
              !isMe &&
              id !== chat.ownerId &&
              (role === "admin" ? canDemote : canAssignAdmin || canGroup(chat, me.id, "roles.assign_moderator"));

            return (
              <li
                key={id}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-secondary/60"
              >
                <Avatar name={u.username} src={u.avatar} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">@{u.username}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Icon size={12} />
                    {ROLE_LABEL[role]}
                  </p>
                </div>
                {canEdit && (
                  <select
                    disabled={busy === id}
                    value={role}
                    onChange={e => void setRole(id, e.target.value as GroupRole)}
                    className="rounded-lg border border-border bg-card px-2 py-1 text-xs"
                  >
                    <option value="member">عضو</option>
                    <option value="moderator">مراقب</option>
                    {(canAssignAdmin || canDemote) && <option value="admin">مشرف</option>}
                  </select>
                )}
              </li>
            );
          })}
        </ul>
        <div className="border-t border-border p-4 pb-[max(1rem,var(--sab))]">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-secondary py-2.5 text-sm font-medium"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
