import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        if #available(iOS 13.0, *) {
            UITextView.appearance().isSelectable = false
        }
        NotificationCenter.default.addObserver(
            forName: UIMenuController.willShowMenuNotification,
            object: nil,
            queue: .main
        ) { _ in
            UIMenuController.shared.hideMenu()
        }

        if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
            FirebaseApp.configure()
            Messaging.messaging().delegate = self
        }

        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        if FirebaseApp.app() != nil {
            Messaging.messaging().apnsToken = deviceToken
            Messaging.messaging().token { token, _ in
                guard let token, !token.isEmpty else { return }
                DispatchQueue.main.async {
                    self.deliverFcmTokenToWeb(token)
                }
            }
        }
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        guard FirebaseApp.app() != nil else { return }
        Messaging.messaging().token { token, _ in
            guard let token, !token.isEmpty else { return }
            DispatchQueue.main.async {
                self.deliverFcmTokenToWeb(token)
            }
        }
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    private func deliverFcmTokenToWeb(_ token: String) {
        guard let vc = window?.rootViewController as? CAPBridgeViewController else { return }
        guard let jsonData = try? JSONSerialization.data(withJSONObject: ["token": token], options: []),
              let json = String(data: jsonData, encoding: .utf8) else { return }
        let js = """
        (function(){
          var d=\(json);
          window.__retweetNativeFcmToken=d.token;
          window.dispatchEvent(new CustomEvent('retweet-fcm-token',{detail:d}));
        })();
        """
        vc.webView?.evaluateJavaScript(js, completionHandler: nil)
    }

}

extension AppDelegate: MessagingDelegate {
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken, !token.isEmpty else { return }
        DispatchQueue.main.async {
            self.deliverFcmTokenToWeb(token)
        }
    }
}
