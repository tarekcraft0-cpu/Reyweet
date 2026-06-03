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
    private var keyboardFrameObservers: [NSObjectProtocol] = []
    private var lastSyncedKeyboardInset: CGFloat = -1
    private var lastSyncedSafeAreaKey: String = ""

    private static let noSelectInjectScript: String = """
    (function(){
      try {
        document.documentElement.classList.add('retweet-native-shell');
        document.documentElement.setAttribute('data-native-app','1');
        if(document.body){document.body.setAttribute('data-native-app','1');}
        window.__RETWEET_NO_SELECT_BOOT__=true;
        (function(){
          [document.documentElement,document.body,document.getElementById('root')].forEach(function(el){
            if(!el)return;
            el.style.width='100%';el.style.maxWidth='100%';el.style.marginLeft='0';el.style.marginRight='0';el.style.left='0';el.style.right='0';el.style.transform='none';
          });
          try{window.scrollTo(0,0);document.documentElement.scrollLeft=0;if(document.body)document.body.scrollLeft=0;}catch(x){}
        })();
        (function(){
          var ua=navigator.userAgent||'';
          if(/iPhone|iPad|iPod/.test(ua)){
            var longSide=Math.max(screen.width,screen.height);
            var fb=longSide>=812?47:20;
            document.documentElement.style.setProperty('--sat',fb+'px');
          }
        })();
        document.documentElement.style.webkitUserSelect='none';
        document.documentElement.style.webkitTouchCallout='none';
        if(document.body){
          document.body.style.webkitUserSelect='none';
          document.body.style.webkitTouchCallout='none';
        }
        var css='html,body,#root{width:100%!important;max-width:100%!important;margin:0!important;left:0!important;right:0!important;overflow-x:hidden!important;transform:none!important;}html.retweet-native-shell,html.retweet-native-shell body{height:100%!important;max-height:100%!important;overflow:hidden!important;overscroll-behavior:none!important;}[data-tab-panel]{width:100%!important;max-width:100%!important;margin-left:0!important;margin-right:0!important;transform:translate3d(0,0,0)!important;left:0!important;right:0!important;}.chat-scroll-pane,[data-scroll-pane]{overflow-y:scroll!important;-webkit-overflow-scrolling:touch!important;touch-action:pan-y!important;overscroll-behavior-y:contain!important;}html.retweet-native-shell,html.retweet-native-shell *,#root,#root *{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;-webkit-user-modify:read-only!important;}html.retweet-native-shell input,html.retweet-native-shell textarea,html.retweet-native-shell select,html.retweet-native-shell [contenteditable=true],html.retweet-native-shell .chat-allow-select,html.retweet-native-shell .chat-allow-select *{-webkit-user-select:text!important;user-select:text!important;-webkit-touch-callout:auto!important;}html.retweet-native-shell ::selection,#root ::selection{background:transparent!important;}';
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
          var scrollSel='.tab-panel-scroll,.chat-inbox-scroll,.chat-scroll-pane,.profile-scroll-pane,.settings-screen-root,.app-dismiss-sheet-panel,.notifications-panel-scroll,[data-scroll-pane]';
          var scrollT=function(t){
            if(!t||!t.closest)return false;
            if(t.closest(scrollSel))return true;
            var el=t;
            for(var d=0;d<10&&el;d++){
              try{
                var oy=getComputedStyle(el).overflowY;
                if((oy==='auto'||oy==='scroll'||oy==='overlay')&&el.scrollHeight>el.clientHeight+4)return true;
              }catch(x){}
              el=el.parentElement;
            }
            return false;
          };
          document.addEventListener('touchstart',function(e){
            if(e.touches.length!==1||allow(e.target)||lp(e.target)||scrollT(e.target))return;
            clear();
          },{capture:true,passive:true});
          document.addEventListener('touchend',function(){clear();},{capture:true,passive:true});
          document.addEventListener('touchcancel',clear,{capture:true,passive:true});
        }
      } catch(e) {}
    })();
    """

    deinit {
        if let obs = menuHideObserver {
            NotificationCenter.default.removeObserver(obs)
        }
        for obs in keyboardFrameObservers {
            NotificationCenter.default.removeObserver(obs)
        }
        keyboardFrameObservers.removeAll()
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        applyGlobalTextMenuGuards()
        applyWebViewGuards()
        observeKeyboardFrameChanges()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        applyWebViewGuards()
        syncSafeAreaInsetsToWebView()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        resetWebViewHorizontalGeometry()
    }

    /** يمنع انزياح الواجهة أفقياً (فراغ أبيض على اليمين في WKWebView) */
    private func resetWebViewHorizontalGeometry() {
        guard let wv = webView else { return }
        let sv = wv.scrollView
        if abs(sv.contentOffset.x) > 0.5 {
            sv.contentOffset = CGPoint(x: 0, y: sv.contentOffset.y)
        }
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        syncSafeAreaInsetsToWebView()
    }

    /** ارتفاع الكيبورد فوق أسفل الشاشة — يُزامَن مع CSS للتمرير داخل الويب */
    @available(iOS 15.0, *)
    private func keyboardOverlapHeight() -> CGFloat {
        let kbFrame = view.keyboardLayoutGuide.layoutFrame
        guard kbFrame.height > 0.5 else { return 0 }
        return max(0, view.bounds.maxY - kbFrame.minY)
    }

    /** مزامنة ارتفاع الكيبورد مع كل إطار من أنيميشن iOS (قبل اكتمال resize:body) */
    private func observeKeyboardFrameChanges() {
        if !keyboardFrameObservers.isEmpty { return }
        let names: [Notification.Name] = [
            UIResponder.keyboardWillChangeFrameNotification,
            UIResponder.keyboardWillShowNotification,
            UIResponder.keyboardWillHideNotification,
        ]
        for name in names {
            let obs = NotificationCenter.default.addObserver(
                forName: name,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.syncSafeAreaInsetsToWebView()
            }
            keyboardFrameObservers.append(obs)
        }
    }

    /** يمرّر safe area + ارتفاع الكيبورد (لرفع شريط الكتابة فقط — الشاشة تبقى ثابتة) */
    private func syncSafeAreaInsetsToWebView() {
        guard let wv = webView else { return }
        let i = view.safeAreaInsets
        let kbInset: CGFloat
        if #available(iOS 15.0, *) {
            kbInset = keyboardOverlapHeight()
        } else {
            kbInset = 0
        }
        let kbChanged = abs(kbInset - lastSyncedKeyboardInset) > 0.5
        let areaKey = String(format: "%.1f|%.1f|%.1f|%.1f", i.top, i.bottom, i.left, i.right)
        let areaChanged = areaKey != lastSyncedSafeAreaKey
        if !areaChanged && !kbChanged { return }
        lastSyncedSafeAreaKey = areaKey
        lastSyncedKeyboardInset = kbInset

        let safeAreaEvent = areaChanged ? "try{window.dispatchEvent(new Event('retweet-safe-area-change'));}catch(e){}" : ""
        let kbEvent = kbChanged ? "try{window.dispatchEvent(new Event('retweet-keyboard-layout-change'));}catch(e){}" : ""

        let js = """
        (function(){
          var r=document.documentElement;
          r.style.setProperty('--retweet-safe-top','\(i.top)px');
          r.style.setProperty('--retweet-safe-bottom','\(i.bottom)px');
          r.style.setProperty('--retweet-safe-left','\(i.left)px');
          r.style.setProperty('--retweet-safe-right','\(i.right)px');
          r.style.setProperty('--retweet-keyboard-inset','\(kbInset)px');
          \(safeAreaEvent)
          \(kbEvent)
        })();
        """
        wv.evaluateJavaScript(js, completionHandler: nil)
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
        /** تمرير داخلي للمحادثة — delaysContentTouches=false يمرّر اللمس لـ overflow-y داخل الصفحة */
        wv.scrollView.isScrollEnabled = true
        wv.scrollView.bounces = false
        wv.scrollView.alwaysBounceVertical = false
        wv.scrollView.delaysContentTouches = false
        wv.scrollView.canCancelContentTouches = true

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
        syncSafeAreaInsetsToWebView()
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
