import type { CSSProperties } from "react";

/** قيم :root / .dark من styles.css — تُطبَّق محلياً على شاشة فرعية */
const LIGHT_VARS: Record<string, string> = {
  "--background": "oklch(1 0 0)",
  "--foreground": "oklch(0.12 0 0)",
  "--card": "oklch(0.98 0 0)",
  "--card-foreground": "oklch(0.12 0 0)",
  "--popover": "oklch(1 0 0)",
  "--popover-foreground": "oklch(0.12 0 0)",
  "--primary": "oklch(0.12 0 0)",
  "--primary-foreground": "oklch(1 0 0)",
  "--secondary": "oklch(0.95 0 0)",
  "--secondary-foreground": "oklch(0.12 0 0)",
  "--muted": "oklch(0.96 0 0)",
  "--muted-foreground": "oklch(0.5 0 0)",
  "--accent": "oklch(0.92 0 0)",
  "--accent-foreground": "oklch(0.12 0 0)",
  "--destructive": "oklch(0.6 0.22 25)",
  "--destructive-foreground": "oklch(1 0 0)",
  "--border": "oklch(0.9 0 0)",
  "--input": "oklch(0.94 0 0)",
  "--ring": "oklch(0.12 0 0)",
};

const DARK_VARS: Record<string, string> = {
  "--background": "oklch(0.08 0 0)",
  "--foreground": "oklch(0.98 0 0)",
  "--card": "oklch(0.13 0 0)",
  "--card-foreground": "oklch(0.98 0 0)",
  "--popover": "oklch(0.13 0 0)",
  "--popover-foreground": "oklch(0.98 0 0)",
  "--primary": "oklch(0.98 0 0)",
  "--primary-foreground": "oklch(0.08 0 0)",
  "--secondary": "oklch(0.18 0 0)",
  "--secondary-foreground": "oklch(0.98 0 0)",
  "--muted": "oklch(0.17 0 0)",
  "--muted-foreground": "oklch(0.65 0 0)",
  "--accent": "oklch(0.22 0 0)",
  "--accent-foreground": "oklch(0.98 0 0)",
  "--destructive": "oklch(0.55 0.2 25)",
  "--destructive-foreground": "oklch(0.98 0 0)",
  "--border": "oklch(0.22 0 0)",
  "--input": "oklch(0.18 0 0)",
  "--ring": "oklch(0.98 0 0)",
};

/** يفرض ألوان الثيم داخل الشاشة حتى لو كان html.dark أو العكس */
export function appThemeScopeStyle(theme: "light" | "dark"): CSSProperties {
  const vars = theme === "dark" ? DARK_VARS : LIGHT_VARS;
  return {
    ...vars,
    backgroundColor: vars["--background"],
    color: vars["--foreground"],
  } as CSSProperties;
}
