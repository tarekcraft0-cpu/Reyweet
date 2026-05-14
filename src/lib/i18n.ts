import { useApp } from "./store";

const dict = {
  ar: {
    home: "الرئيسية", search: "البحث", reels: "ريلز", chat: "الرسائل", profile: "البروفايل",
    settings: "الإعدادات", notifications: "الإشعارات", create: "إنشاء", post: "منشور", tweet: "تغريدة", story: "ستوري",
    follow: "متابعة", following: "متابَع", followers: "متابعون", followsCount: "يتابع", message: "رسالة",
    edit: "تعديل البروفايل", share: "مشاركة البروفايل", block: "حظر", unblock: "إلغاء الحظر",
    private: "حساب خاص", darkMode: "الوضع الليلي", language: "اللغة", logout: "تسجيل الخروج",
    accountInfo: "معلومات الحساب", changePwd: "تغيير كلمة المرور", help: "مركز المساعدة", about: "عن التطبيق",
    requests: "طلبات الرسائل", group: "مجموعة", channel: "قناة", note: "نوت", addNote: "أضف نوت",
    members: "أعضاء", leave: "خروج من القناة", searchPlaceholder: "ابحث...", trending: "الرائج",
    quranChannel: "قناة القرآن", quranDesc: "أدعية وأحاديث",
    yourStory: "قصتك", noPosts: "لا يوجد منشورات", noChats: "لا توجد محادثات", noReels: "لا يوجد ريلز",
    comments: "تعليقات", likes: "إعجابات", reposts: "إعادات نشر", send: "إرسال", typeMessage: "اكتب رسالة...",
    closeFriends: "الأصدقاء المقربون", audienceAll: "الجميع", audienceClose: "أصدقاء مقربون",
    accountPrivate: "حسابك الآن خاص", locked: "محتوى مقفل — تابع لرؤيته",
    save: "حفظ", cancel: "إلغاء", close: "إغلاق", delete: "حذف", accept: "قبول", create_: "إنشاء", next: "التالي",
    accounts: "الحسابات", addAccount: "إضافة حساب", newGroup: "مجموعة جديدة", newChannel: "قناة جديدة",
    onlyOwner: "فقط مالك القناة يمكنه الكتابة", inviteHost: "دعوة كمساهم", removeHost: "إزالة مساهم",
    blocked: "تم الحظر", privacy: "الخصوصية والأمان", preferences: "التفضيلات", support: "الدعم",
    addMembers: "اختر الأعضاء (٢ على الأقل)", groupName: "اسم المجموعة", channelName: "اسم القناة",
    typing: "يكتب...", recording: "جاري التسجيل...", stop: "إيقاف",
    publish: "نشر", attach: "إرفاق",
    msgReply: "رد", msgForward: "إعادة توجيه", msgCopy: "نسخ", msgDeleteForYou: "حذف عندك فقط",
    msgReport: "إبلاغ", msgMore: "المزيد", msgCopied: "تم النسخ", msgReportThanks: "تم استلام البلاغ",
    msgMoreSoon: "المزيد قريباً", msgCloseMenu: "إغلاق القائمة",
    msgForwardedFrom: "معاد توجيه من", msgPin: "تثبيت", msgUnpin: "إلغاء التثبيت",
    stickerAddFavorite: "إضافة إلى المفضلة", stickerFavoriteAdded: "تمت الإضافة للمفضلة",
    forwardPickChat: "إعادة توجيه إلى…", forwardEmpty: "لا محادثات مطابقة",
    pinnedBar: "مثبت",
    chatListPin: "تثبيت المحادثة في الأعلى",
    chatListUnpin: "إلغاء تثبيت المحادثة",
    chatMenuDelete: "حذف",
    chatMenuDeleteConfirm: "حذف هذه المحادثة من جهازك؟",
    msgRequestOpenMessage: "عرض الرسالة",
    msgRequestAcceptOpen: "قبول والدردشة",
    msgRequestDecline: "رفض",
    chatMenuMute: "كتم الإشعارات",
    chatMenuUnmute: "إلغاء كتم الإشعارات",
    chatRowLongPressHint: "اضغط مطولاً على المحادثة للخيارات (تثبيت، كتم، حذف)",
  },
  en: {
    home: "Home", search: "Search", reels: "Reels", chat: "Messages", profile: "Profile",
    settings: "Settings", notifications: "Notifications", create: "Create", post: "Post", tweet: "Tweet", story: "Story",
    follow: "Follow", following: "Following", followers: "Followers", followsCount: "Following", message: "Message",
    edit: "Edit Profile", share: "Share Profile", block: "Block", unblock: "Unblock",
    private: "Private Account", darkMode: "Dark Mode", language: "Language", logout: "Log out",
    accountInfo: "Account Info", changePwd: "Change Password", help: "Help Center", about: "About",
    requests: "Message Requests", group: "Group", channel: "Channel", note: "Note", addNote: "Add a note",
    members: "members", leave: "Leave channel", searchPlaceholder: "Search...", trending: "Trending",
    quranChannel: "Quran Channel", quranDesc: "Du'as & Hadith",
    yourStory: "Your story", noPosts: "No posts yet", noChats: "No conversations", noReels: "No reels yet",
    comments: "Comments", likes: "Likes", reposts: "Reposts", send: "Send", typeMessage: "Message...",
    closeFriends: "Close Friends", audienceAll: "Everyone", audienceClose: "Close friends",
    accountPrivate: "Your account is now private", locked: "Locked — follow to view",
    save: "Save", cancel: "Cancel", close: "Close", delete: "Delete", accept: "Accept", create_: "Create", next: "Next",
    accounts: "Accounts", addAccount: "Add account", newGroup: "New group", newChannel: "New channel",
    onlyOwner: "Only the channel owner can post", inviteHost: "Invite as host", removeHost: "Remove host",
    blocked: "Blocked", privacy: "Privacy & Security", preferences: "Preferences", support: "Support",
    addMembers: "Pick members (min 2)", groupName: "Group name", channelName: "Channel name",
    typing: "typing...", recording: "Recording...", stop: "Stop",
    publish: "Publish", attach: "Attach",
    msgReply: "Reply", msgForward: "Forward", msgCopy: "Copy", msgDeleteForYou: "Delete for you",
    msgReport: "Report", msgMore: "More", msgCopied: "Copied", msgReportThanks: "Report received",
    msgMoreSoon: "More options coming soon", msgCloseMenu: "Close menu",
    msgForwardedFrom: "Forwarded from", msgPin: "Pin", msgUnpin: "Unpin",
    stickerAddFavorite: "Add to favorites", stickerFavoriteAdded: "Saved to sticker favorites",
    forwardPickChat: "Forward to…", forwardEmpty: "No matching chats",
    pinnedBar: "Pinned",
    chatListPin: "Pin chat to top",
    chatListUnpin: "Unpin chat",
    chatMenuDelete: "Delete",
    chatMenuDeleteConfirm: "Delete this conversation from your device?",
    msgRequestOpenMessage: "View message",
    msgRequestAcceptOpen: "Accept and chat",
    msgRequestDecline: "Decline",
    chatMenuMute: "Mute notifications",
    chatMenuUnmute: "Unmute notifications",
    chatRowLongPressHint: "Long-press the chat row for options (pin, mute, delete)",
  },
} as const;

export type TKey = keyof typeof dict["ar"];

export function useT() {
  const { state } = useApp();
  /** قبل تسجيل الدخول نعرض العربية دائماً حتى لا تظهر واجهة الدخول بالإنجليزي عن طريق الخطأ */
  const lang = !state.currentUserId ? "ar" : state.language === "en" ? "en" : "ar";
  return (k: TKey) => (dict[lang] as any)[k] ?? k;
}

export function useLang() {
  const { state } = useApp();
  return state.language === "en" ? "en" : "ar";
}
