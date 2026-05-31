/** شريط علوي يساوي safe-area — يُستخدم مرة واحدة في shell التطبيق */
export function SafeAreaTop() {
  return (
    <div
      className="safe-area-top shrink-0 w-full bg-background"
      aria-hidden
    />
  );
}
