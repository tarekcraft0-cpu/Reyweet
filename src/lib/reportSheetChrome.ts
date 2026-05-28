/** يُبث عند فتح/إغلاق ورقة البلاغ — لإخفاء الشريط السفلي في App */
export const REPORT_SHEET_OPEN_EVENT = "retweet-report-sheet-open";

export function setReportSheetOpen(open: boolean): void {
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("retweet-report-open", open);
  }
  try {
    window.dispatchEvent(
      new CustomEvent(REPORT_SHEET_OPEN_EVENT, { detail: { open } }),
    );
  } catch {
    /* ignore */
  }
}
