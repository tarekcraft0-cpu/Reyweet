import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
} from "react";
export const NAV_HIDE_PROGRESS_CSS_VAR = "--retweet-nav-hide-progress";
export const REELS_NAV_COLLAPSE_PROGRESS_VAR = "--retweet-reels-nav-collapse-progress";

const DEFAULT_TRAVEL_PX = 72;
const SUPPRESS_TAP_MS = 180;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function useBottomNavSheet(options?: {
  /** سحب خروج المحادثة — القيمة من CSS var (يُحدَّث من ChatScreen دون إعادة render) */
  externalHideDrive?: boolean;
}) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const navRef = useRef<HTMLDivElement>(null);
  const travelRef = useRef(DEFAULT_TRAVEL_PX);
  const suppressTapUntilRef = useRef(0);

  const shouldSuppressTap = useCallback(() => Date.now() < suppressTapUntilRef.current, []);

  const measureTravel = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    if (h > 0) travelRef.current = h;
  }, []);

  const publishHideProgress = useCallback((p: number) => {
    document.documentElement.style.setProperty(NAV_HIDE_PROGRESS_CSS_VAR, String(clamp(p, 0, 1)));
  }, []);

  useLayoutEffect(() => {
    measureTravel();
    publishHideProgress(0);
  }, [measureTravel, publishHideProgress]);

  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measureTravel());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureTravel]);

  useEffect(() => {
    document.documentElement.style.setProperty(REELS_NAV_COLLAPSE_PROGRESS_VAR, "0");
    return () => {
      document.documentElement.style.removeProperty(NAV_HIDE_PROGRESS_CSS_VAR);
      document.documentElement.style.removeProperty(REELS_NAV_COLLAPSE_PROGRESS_VAR);
    };
  }, []);

  const travel = travelRef.current;
  const externalDrive = !!optionsRef.current?.externalHideDrive;

  const navStyle: CSSProperties = externalDrive
    ? {
        transform: `translate3d(0, calc(var(${NAV_HIDE_PROGRESS_CSS_VAR}, 0) * ${travel}px), 0)`,
        transformOrigin: "50% 100%",
        transition: "none",
        willChange: "transform",
      }
    : {
        transform: "translate3d(0, 0, 0)",
        transformOrigin: "50% 100%",
        transition: "none",
        willChange: "auto",
      };

  return {
    navRef,
    navStyle,
    shouldSuppressTap,
  };
}
