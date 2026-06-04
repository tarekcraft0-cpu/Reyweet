package com.reyweet.app;

import android.graphics.Rect;
import android.os.Bundle;
import android.view.View;
import android.view.ViewTreeObserver;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

/**
 * جسر Android — safe area + ارتفاع الكيبورد (مثل RetweetBridgeViewController على iOS).
 */
public class MainActivity extends BridgeActivity {
  private View decorView;
  private int lastKbInset = -1;
  private String lastSafeKey = "";

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    decorView = getWindow().getDecorView();
    ViewCompat.setOnApplyWindowInsetsListener(decorView, (v, insets) -> {
      Insets status = insets.getInsets(WindowInsetsCompat.Type.statusBars());
      Insets nav = insets.getInsets(WindowInsetsCompat.Type.navigationBars());
      Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
      int kb = Math.max(0, ime.bottom - nav.bottom);
      pushInsetsToWeb(status.top, nav.bottom, kb);
      return insets;
    });
    decorView.getViewTreeObserver().addOnGlobalLayoutListener(this::onLayoutMaybeKeyboard);
  }

  private void onLayoutMaybeKeyboard() {
    if (decorView == null) return;
    Rect r = new Rect();
    decorView.getWindowVisibleDisplayFrame(r);
    int screenH = decorView.getRootView().getHeight();
    int gap = screenH - r.bottom;
    if (gap > 80 && gap < screenH * 0.55) {
      pushInsetsToWeb(-1, -1, gap);
    }
  }

  private void pushInsetsToWeb(int topPx, int bottomPx, int kbPx) {
    if (kbPx >= 0 && Math.abs(kbPx - lastKbInset) < 2 && topPx < 0) return;
    if (kbPx >= 0) lastKbInset = kbPx;

    Bridge bridge = getBridge();
    if (bridge == null) return;
    WebView wv = bridge.getWebView();
    if (wv == null) return;

    float top = topPx >= 0 ? topPx : 0;
    float bottom = bottomPx >= 0 ? bottomPx : 0;
    float kb = kbPx >= 0 ? kbPx : lastKbInset >= 0 ? lastKbInset : 0;

    String safeKey = top + "|" + bottom + "|" + kb;
    boolean safeChanged = topPx >= 0 && !safeKey.equals(lastSafeKey);
    if (safeChanged) lastSafeKey = safeKey;

    String safeEvent = safeChanged
      ? "try{window.dispatchEvent(new Event('retweet-safe-area-change'));}catch(e){}"
      : "";
    String kbEvent =
      kb > 8
        ? "try{window.dispatchEvent(new Event('retweet-keyboard-layout-change'));}catch(e){}"
        : "";

    String js =
      "(function(){"
        + "var r=document.documentElement;"
        + (topPx >= 0 ? "r.style.setProperty('--retweet-safe-top','" + top + "px');" : "")
        + (bottomPx >= 0 ? "r.style.setProperty('--retweet-safe-bottom','" + bottom + "px');" : "")
        + "r.style.setProperty('--retweet-keyboard-inset','" + kb + "px');"
        + safeEvent
        + kbEvent
        + "})();";
    wv.post(() -> wv.evaluateJavascript(js, null));
  }
}
