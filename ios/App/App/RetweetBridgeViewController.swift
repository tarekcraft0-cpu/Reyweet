import UIKit
import Capacitor
import WebKit

/**
 * يعطّل التحديد الأزرق وقائمة iOS (Copy / Look Up / Translate) في كل WKWebView.
 * الضغط المطوّل يُدار من JavaScript عبر [data-native-long-press].
 */
class RetweetBridgeViewController: CAPBridgeViewController, WKUIDelegate, WKNavigationDelegate {
    private weak var configuredWebView: WKWebView?
    private var menuHideObserver: NSObjectProtocol?

    private static let noSelectInjectScript: String = """
    (function(){
      try {
        document.documentElement.classList.add('retweet-native-shell');
        window.__RETWEET_NO_SELECT_BOOT__=true;
        document.documentElement.style.webkitUserSelect='none';
        document.documentElement.style.webkitTouchCallout='none';
        if(document.body){
          document.body.style.webkitUserSelect='none';
          document.body.style.webkitTouchCallout='none';
        }
        var css='html.retweet-native-shell,html.retweet-native-shell *,#root,#root *{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;-webkit-user-modify:read-only!important;}html.retweet-native-shell input,html.retweet-native-shell textarea,html.retweet-native-shell select,html.retweet-native-shell [contenteditable=true],html.retweet-native-shell .chat-allow-select,html.retweet-native-shell .chat-allow-select *{-webkit-user-select:text!important;user-select:text!important;-webkit-touch-callout:auto!important;}html.retweet-native-shell ::selection,#root ::selection{background:transparent!important;}';
        var id='retweet-ios-no-select';
        if(!document.getElementById(id)){
          var s=document.createElement('style');
          s.id=id;
          s.textContent=css;
          (document.head||document.documentElement).appendChild(s);
        }
        var allow=function(t){return t&&t.closest&&!!t.closest('input,textarea,select,[contenteditable=true],.chat-allow-select,.native-allow-select');};
        var lp=function(t){return t&&t.closest&&!!t.closest('[data-native-long-press]');};
        var clear=function(){try{var sel=window.getSelection();if(sel&&!sel.isCollapsed)sel.removeAllRanges();}catch(x){}};
        var block=function(e){if(allow(e.target)||lp(e.target))return;e.preventDefault();e.stopPropagation();clear();};
        if(!window.__RETWEET_IOS_BLOCK_MENU__){
          window.__RETWEET_IOS_BLOCK_MENU__=true;
          var o={capture:true,passive:false};
          ['selectstart','contextmenu','dragstart','copy','cut'].forEach(function(ev){document.addEventListener(ev,block,o);});
          document.addEventListener('selectionchange',function(){
            var sel=window.getSelection();
            if(!sel||sel.isCollapsed)return;
            var n=sel.anchorNode;
            var el=n&&(n.nodeType===3?n.parentElement:n);
            if(el&&allow(el))return;
            sel.removeAllRanges();
          },true);
          var sx=0,sy=0,moved=0,raf=0;
          var stopRaf=function(){if(raf){cancelAnimationFrame(raf);raf=0;}};
          var loop=function(){clear();raf=requestAnimationFrame(loop);};
          document.addEventListener('touchstart',function(e){
            stopRaf();
            if(e.touches.length!==1||allow(e.target)||lp(e.target))return;
            sx=e.touches[0].clientX;sy=e.touches[0].clientY;moved=0;clear();raf=requestAnimationFrame(loop);
          },{capture:true,passive:true});
          document.addEventListener('touchmove',function(e){
            if(!e.touches[0]||allow(e.target)||lp(e.target))return;
            var dx=Math.abs(e.touches[0].clientX-sx),dy=Math.abs(e.touches[0].clientY-sy);
            if(dx>12||dy>12){moved=1;stopRaf();return;}
            if(!moved){e.preventDefault();clear();}
          },{capture:true,passive:false});
          var end=function(){stopRaf();moved=0;clear();};
          document.addEventListener('touchend',end,{capture:true,passive:true});
          document.addEventListener('touchcancel',end,{capture:true,passive:true});
        }
      } catch(e) {}
    })();
    """

    deinit {
        if let obs = menuHideObserver {
            NotificationCenter.default.removeObserver(obs)
        }
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        applyGlobalTextMenuGuards()
        applyWebViewGuards()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        applyWebViewGuards()
    }

    private func applyGlobalTextMenuGuards() {
        // UITextView only — UITextField has no isSelectable API in UIKit.
        if #available(iOS 13.0, *) {
            UITextView.appearance().isSelectable = false
        }

        if menuHideObserver == nil {
            menuHideObserver = NotificationCenter.default.addObserver(
                forName: UIMenuController.willShowMenuNotification,
                object: nil,
                queue: .main
            ) { _ in
                UIMenuController.shared.hideMenu()
            }
        }
    }

    private func applyWebViewGuards() {
        guard let wv = webView else { return }
        if configuredWebView === wv {
            injectNoSelectScript(into: wv)
            return
        }
        configuredWebView = wv

        wv.uiDelegate = self
        wv.navigationDelegate = self
        wv.allowsLinkPreview = false
        if #available(iOS 16.0, *) {
            wv.isFindInteractionEnabled = false
        }
        wv.scrollView.contentInsetAdjustmentBehavior = .never

        let ucc = wv.configuration.userContentController
        let alreadyInjected = ucc.userScripts.contains { $0.source.contains("retweet-native-shell") }
        if !alreadyInjected {
            let script = WKUserScript(
                source: Self.noSelectInjectScript,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
            ucc.addUserScript(script)
        }

        injectNoSelectScript(into: wv)
    }

    private func injectNoSelectScript(into webView: WKWebView) {
        webView.evaluateJavaScript(Self.noSelectInjectScript, completionHandler: nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        injectNoSelectScript(into: webView)
    }

    func webView(
        _ webView: WKWebView,
        contextMenuConfigurationForElement elementInfo: WKContextMenuElementInfo,
        completionHandler: @escaping (UIContextMenuConfiguration?) -> Void
    ) {
        completionHandler(nil)
    }

    func webView(
        _ webView: WKWebView,
        contextMenuWillPresentForElement elementInfo: WKContextMenuElementInfo
    ) {
        UIMenuController.shared.hideMenu()
    }
}

/** UIView يمنع UIMenuController على الطبقات الأصلية */
class RetweetNoSelectView: UIView {
    override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
        false
    }

    override var canBecomeFirstResponder: Bool {
        false
    }
}
