/** نفس منطق العميل — رمز 6 أرقام غير قابل للتوقع */
export function generateOtpDigits(): string {
  const c = globalThis.crypto;
  if (c?.getRandomValues) {
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    return String(100000 + (buf[0]! % 900000));
  }
  return String(100000 + Math.floor(Math.random() * 900000));
}
