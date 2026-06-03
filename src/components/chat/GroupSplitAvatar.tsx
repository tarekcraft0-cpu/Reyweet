import { Avatar } from "../Avatar";
import { isCustomGroupAvatar, pickGroupSplitMembers } from "@/lib/groupAvatar";
import type { ID, User } from "@/lib/types";

type MemberPick = Pick<User, "id" | "username" | "avatar">;

type Props = {
  chatId: string;
  name?: string;
  avatar?: string;
  memberUsers: MemberPick[];
  viewerId?: ID;
  size?: number;
  className?: string;
};

/** أفتار قروب افتراضي: نصفان — يمين عضو ثابت، يسار عضو ثابت حسب معرّف القروب */
export function GroupSplitAvatar({
  chatId,
  name = "مجموعة",
  avatar,
  memberUsers,
  viewerId,
  size = 48,
  className = "",
}: Props) {
  if (isCustomGroupAvatar(avatar)) {
    return <Avatar name={name} src={avatar} size={size} className={className} />;
  }

  const pair = pickGroupSplitMembers(chatId, memberUsers, viewerId);
  if (!pair) {
    return <Avatar name={name} src={avatar} size={size} className={className} />;
  }

  const [rightMember, leftMember] = pair;

  return (
    <div
      className={"relative shrink-0 overflow-hidden rounded-full bg-secondary ring-1 ring-border/40 " + className}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <div className="absolute bottom-0 left-0 top-0 w-1/2 overflow-hidden border-r border-background">
        <div className="absolute left-0 top-0">
          <Avatar name={leftMember.username} src={leftMember.avatar} size={size} />
        </div>
      </div>
      <div className="absolute bottom-0 right-0 top-0 w-1/2 overflow-hidden">
        <div className="absolute right-0 top-0">
          <Avatar name={rightMember.username} src={rightMember.avatar} size={size} />
        </div>
      </div>
    </div>
  );
}
