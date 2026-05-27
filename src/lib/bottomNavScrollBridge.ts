import { NAV_HIDE_PROGRESS_CSS_VAR } from "@/hooks/useBottomNavSheet";

/** يُبقى للتوافق — لم يعد هناك إخفاء بالتمرير */
export function resetScrollNavHide() {
  document.documentElement.style.setProperty(NAV_HIDE_PROGRESS_CSS_VAR, "0");
}
