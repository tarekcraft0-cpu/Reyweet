import { memo } from "react";

/**
 * أيقونة PNG (خطوط بيضاء على خلفية سوداء) — تظهر أبيض على الشريط الداكن
 */
export const NavMaskIcon = memo(function NavMaskIcon({
  src,
  className = "h-6 w-6 shrink-0",
}: {
  src: string;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-hidden
      className={"block " + className}
      style={{
        backgroundColor: "#ffffff",
        WebkitMaskImage: `url("${src}")`,
        maskImage: `url("${src}")`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskMode: "luminance",
        maskMode: "luminance",
      }}
    />
  );
});
