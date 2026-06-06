import { useEffect, useState } from "react";
import { isServerReachable } from "@/lib/serverReachability";

/** شريط يوضح أن التطبيق يعمل من الجلسة المحلية والخادم غير متاح */
export function OfflineModeBanner() {
  const [offline, setOffline] = useState(() => !isServerReachable());

  useEffect(() => {
    const onOff = () => setOffline(true);
    const onOn = () => setOffline(false);
    window.addEventListener("retweet-server-offline", onOff);
    window.addEventListener("retweet-server-online", onOn);
    return () => {
      window.removeEventListener("retweet-server-offline", onOff);
      window.removeEventListener("retweet-server-online", onOn);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[20000] flex justify-center px-3 pt-[max(0.35rem,env(safe-area-inset-top))]"
      dir="rtl"
      role="status"
    >
      <p className="rounded-full bg-amber-500/95 px-3 py-1.5 text-center text-[11px] font-medium text-amber-950 shadow-md">
        وضع محلي — الخادم غير متصل. يمكنك التصفح والكتابة؛ المزامنة عند عودة الاتصال.
      </p>
    </div>
  );
}
