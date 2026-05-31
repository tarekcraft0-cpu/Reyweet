/**
 * قبل React — منع التحديد الأزرق على كل الشاشات (رئيسية، ريلز، بروفايل…).
 */
(function () {
  "use strict";
  if (typeof document === "undefined") return;

  /** إذا index.html محفوظ في الكاش ويشير لحزمة JS قديمة — جلب HTML حي وإعادة تحميل /app/ */
  (function ensureFreshAppBundle() {
    if (window.__RETWEET_BUNDLE_GUARD__) return;
    window.__RETWEET_BUNDLE_GUARD__ = 1;
    try {
      var q = location.search || "";
      if (/[?&](force|_b|_)=\d+/.test(q)) return;
      var mod = document.querySelector('script[type="module"][src*="/assets/index-"]');
      if (!mod) return;
      var mine = mod.getAttribute("src") || "";
      if (!mine) return;
      var knownBroken = /index-DtMhfcKB|index-CXgAWalW|index-C54KUatj/i;
      if (knownBroken.test(mine)) {
        location.replace(location.origin + "/app/?force=" + Date.now());
        return;
      }
      fetch(location.origin + "/app/index.html", { cache: "no-store" })
        .then(function (r) {
          return r.text();
        })
        .then(function (html) {
          var m = html.match(/\/assets\/(index-[A-Za-z0-9_-]+\.js)/);
          if (!m || !m[1]) return;
          if (mine.indexOf(m[1]) >= 0) return;
          location.replace(location.origin + "/app/?force=" + Date.now());
        })
        .catch(function () {
          /* ignore */
        });
    } catch (e) {
      /* ignore */
    }
  })();

  window.__RETWEET_NO_SELECT_BOOT__ = true;
  document.documentElement.classList.add("retweet-native-shell");

  var css =
    "html.retweet-native-shell,html.retweet-native-shell *,#root,#root *{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;-webkit-tap-highlight-color:transparent!important;-webkit-user-modify:read-only!important;}" +
    "html.retweet-native-shell input,html.retweet-native-shell textarea,html.retweet-native-shell select,html.retweet-native-shell [contenteditable=true],html.retweet-native-shell .chat-allow-select,html.retweet-native-shell .chat-allow-select *,#root input,#root textarea,#root select,#root [contenteditable=true],#root .chat-allow-select,#root .chat-allow-select *{-webkit-user-select:text!important;user-select:text!important;-webkit-touch-callout:auto!important;-webkit-user-modify:read-write!important;}" +
    "html.retweet-native-shell ::selection,#root ::selection{background:transparent!important;color:inherit!important;}" +
    "html.retweet-native-shell img,html.retweet-native-shell video,html.retweet-native-shell canvas,html.retweet-native-shell svg,#root img,#root video,#root canvas,#root svg{-webkit-user-drag:none!important;-webkit-touch-callout:none!important;}" +
    ".retweet-no-select-pane,.retweet-no-select-pane *{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;}";

  if (!document.getElementById("retweet-ios-no-select")) {
    var style = document.createElement("style");
    style.id = "retweet-ios-no-select";
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  document.documentElement.style.webkitUserSelect = "none";
  document.documentElement.style.webkitTouchCallout = "none";

  function allowTarget(t) {
    if (!t || !t.closest) return false;
    return !!t.closest(
      'input,textarea,select,[contenteditable="true"],.chat-allow-select,.native-allow-select',
    );
  }

  function longPressTarget(t) {
    if (!t || !t.closest) return false;
    return !!t.closest("[data-native-long-press]");
  }

  function clearSelection() {
    try {
      var sel = window.getSelection();
      if (sel && !sel.isCollapsed) sel.removeAllRanges();
    } catch (e) {}
  }

  function blockMenu(e) {
    if (allowTarget(e.target)) return;
    if (longPressTarget(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    clearSelection();
  }

  var cap = { capture: true, passive: false };
  ["selectstart", "contextmenu", "dragstart", "copy", "cut"].forEach(function (ev) {
    document.addEventListener(ev, blockMenu, cap);
  });

  document.addEventListener(
    "selectionchange",
    function () {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      var node = sel.anchorNode;
      if (!node) return;
      var el = node.nodeType === 3 ? node.parentElement : node;
      if (el && allowTarget(el)) return;
      sel.removeAllRanges();
    },
    true,
  );

  var startX = 0;
  var startY = 0;
  var touchMoved = false;
  var rafId = 0;
  var isAndroid = /Android/i.test(typeof navigator !== "undefined" ? navigator.userAgent : "");

  function stopRaf() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function loopClear() {
    clearSelection();
    rafId = requestAnimationFrame(loopClear);
  }

  document.addEventListener(
    "touchstart",
    function (e) {
      stopRaf();
      if (e.touches.length !== 1) return;
      if (allowTarget(e.target) || longPressTarget(e.target)) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      touchMoved = false;
      clearSelection();
      rafId = requestAnimationFrame(loopClear);
    },
    { capture: true, passive: true },
  );

  document.addEventListener(
    "touchmove",
    function (e) {
      if (!e.touches[0]) return;
      if (allowTarget(e.target) || longPressTarget(e.target)) return;
      var dx = Math.abs(e.touches[0].clientX - startX);
      var dy = Math.abs(e.touches[0].clientY - startY);
      if (dy > dx && dy > 4) {
        touchMoved = true;
        stopRaf();
        return;
      }
      if (dx > 12 || dy > 12) {
        touchMoved = true;
        stopRaf();
        return;
      }
      if (!touchMoved && !isAndroid) {
        e.preventDefault();
        clearSelection();
      }
    },
    { capture: true, passive: false },
  );

  function endTouch() {
    stopRaf();
    touchMoved = false;
    clearSelection();
  }

  document.addEventListener("touchend", endTouch, { capture: true, passive: true });
  document.addEventListener("touchcancel", endTouch, { capture: true, passive: true });

  /** قبل React — ضبط --sat حتى لا يظهر الهيدر تحت النوتش */
  function syncSafeAreaEarly() {
    try {
      var root = document.documentElement;
      var host = document.body || root;
      var probe = document.createElement("div");
      probe.style.cssText =
        "position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top)";
      host.appendChild(probe);
      var envTop = parseFloat(getComputedStyle(probe).paddingTop) || 0;
      probe.remove();
      var swiftTop =
        parseFloat(getComputedStyle(root).getPropertyValue("--retweet-safe-top")) || 0;
      var top = Math.max(envTop, swiftTop);
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent || "")) {
        var longSide = Math.max(screen.width, screen.height);
        if (top < 20) top = Math.max(top, longSide >= 812 ? 47 : 20);
      }
      root.style.setProperty("--sat", top + "px");
      root.style.setProperty("--sab", "env(safe-area-inset-bottom, 0px)");
    } catch (e) {
      /* ignore */
    }
  }

  syncSafeAreaEarly();
  document.addEventListener("DOMContentLoaded", syncSafeAreaEarly);
  window.addEventListener("retweet-safe-area-change", syncSafeAreaEarly, { passive: true });
})();
