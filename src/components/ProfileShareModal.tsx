import { useState, useEffect } from "react";
import { useApp, userById } from "@/lib/store";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import { Avatar } from "./Avatar";
import { X, Link2, QrCode, Copy } from "lucide-react";
import QRCode from "qrcode";

interface Props {
  userId: string;
  onClose: () => void;
}

export function ProfileShareModal({ userId, onClose }: Props) {
  const { state, currentUser, openOrCreateChat, sendMessage, isGuest } = useApp();
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [shareComment, setShareComment] = useState("");
  const [showFriendList, setShowFriendList] = useState(false);
  
  const user = userById(state, userId);
  const me = currentUser!;
  const friends = me.following.map(id => userById(state, id)).filter(Boolean);

  useEffect(() => {
    const baseUrl = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : "";
    const url = `${baseUrl}?profile=${encodeURIComponent(userId)}`;
    setProfileUrl(url);

    // Generate QR Code
    QRCode.toDataURL(url, {
      width: 200,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF"
      }
    })
    .then(setQrCodeUrl)
    .catch(console.error);
  }, [userId]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      alert("تم نسخ رابط الملف الشخصي");
    } catch {
      alert(profileUrl);
    }
  };

  const shareWithFriend = (friendId: string) => {
    if (isGuest) {
      notifyGuestActionBlocked();
      return;
    }
    const chat = openOrCreateChat(friendId);
    if (!chat) {
      if (isGuest) notifyGuestActionBlocked();
      else window.alert("تعذّر فتح المحادثة.");
      return;
    }
    const message = shareComment.trim()
      ? `👤 شارك الملف الشخصي لـ @${user?.username}\n${shareComment}\n${profileUrl}`
      : `👤 شارك الملف الشخصي لـ @${user?.username}\n${profileUrl}`;
    
    sendMessage(chat.id, { type: "text", content: message });
    setShareComment("");
    setShowFriendList(false);
    alert("تم إرسال الملف الشخصي لصديقك");
  };

  if (!user) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
      <div className="bg-background rounded-3xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">مشاركة الملف الشخصي</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col items-center mb-6">
          <Avatar name={user.username} src={user.avatar} size={80} />
          <h4 className="text-lg font-semibold mt-2">@{user.username}</h4>
          <p className="text-sm text-muted-foreground">{user.bio || "لا يوجد وصف"}</p>
        </div>

        {/* QR Code */}
        {qrCodeUrl && (
          <div className="flex flex-col items-center mb-6">
            <div className="bg-white p-4 rounded-2xl">
              <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">امسح ضوئياً للوصول إلى الملف الشخصي</p>
          </div>
        )}

        {/* Share Comment */}
        <div className="mb-4">
          <textarea
            value={shareComment}
            onChange={(e) => setShareComment(e.target.value)}
            placeholder="اكتب تعليق للمشاركة (اختياري)"
            maxLength={100}
            rows={2}
            className="w-full bg-input rounded-2xl px-4 py-3 text-sm outline-none resize-none"
          />
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 mb-4">
          <button
            onClick={copyLink}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-secondary font-medium"
          >
            <Link2 size={18} />
            نسخ الرابط
          </button>
          
          <button
            onClick={() => setShowFriendList(!showFriendList)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-primary-foreground font-medium"
          >
            <QrCode size={18} />
            مشاركة مع الأصدقاء
          </button>
        </div>

        {/* Friend List */}
        {showFriendList && (
          <div className="border-t border-border pt-4">
            <h4 className="text-sm font-semibold mb-3">اختر صديقاً للمشاركة</h4>
            {friends.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm">لا يوجد أصدقاء للمشاركة</p>
            ) : (
              <div className="grid grid-cols-3 gap-3 max-h-48 overflow-y-auto">
                {friends.map(friend => {
                  if (!friend) return null;
                  return (
                    <button
                      key={friend.id}
                      onClick={() => shareWithFriend(friend.id)}
                      className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-secondary"
                    >
                      <Avatar name={friend.username} src={friend.avatar} size={40} />
                      <span className="text-xs truncate w-full text-center">{friend.username}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
