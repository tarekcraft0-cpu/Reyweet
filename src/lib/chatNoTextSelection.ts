import { nativeNoSelectCaptureHandlers } from "./nativeTextSelectionGuard";

/** يمنع التحديد الأزرق وقائمة iOS داخل غرفة المحادثة (مربع الكتابة مستثنى) */
export const chatNoSelectCaptureHandlers = nativeNoSelectCaptureHandlers;
