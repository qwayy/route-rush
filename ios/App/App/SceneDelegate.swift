import UIKit
import Capacitor
import WebKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = GameViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

// Small native helpers for the game, exposed to the page as window.RRNative
// (the iPhone twin of RRShellPlugin.java on Android):
//   getSaves()      all saved values, read synchronously before the game starts
//   isRelease()     true in App Store / TestFlight builds
//   keepAwake(on)   keep the screen on while riding
class GameViewController: CAPBridgeViewController {

    // Same storage the @capacitor/preferences plugin writes to (its default group).
    private static let prefsPrefix = "CapacitorStorage."

    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let config = super.webViewConfiguration(for: instanceConfiguration)
        config.userContentController.addUserScript(WKUserScript(source: Self.bridgeScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController.add(KeepAwakeHandler(), name: "rrKeepAwake")
        return config
    }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }

    private static func bridgeScript() -> String {
        var saves: [String: String] = [:]
        for (key, value) in UserDefaults.standard.dictionaryRepresentation() where key.hasPrefix(prefsPrefix) {
            if let s = value as? String { saves[String(key.dropFirst(prefsPrefix.count))] = s }
        }
        let data = (try? JSONSerialization.data(withJSONObject: saves)) ?? Data("{}".utf8)
        // JSON.stringify'd twice: the page gets a string, as from Android's getSaves().
        let json = String(data: data, encoding: .utf8) ?? "{}"
        let quoted = String(data: (try? JSONSerialization.data(withJSONObject: [json])) ?? Data("[\"{}\"]".utf8), encoding: .utf8) ?? "[\"{}\"]"
        #if DEBUG
        let release = "false"
        #else
        let release = "true"
        #endif
        return """
        window.RRNative = {
          getSaves: function () { return \(quoted)[0]; },
          isRelease: function () { return \(release); },
          keepAwake: function (on) { window.webkit.messageHandlers.rrKeepAwake.postMessage(!!on); }
        };
        """
    }
}

private class KeepAwakeHandler: NSObject, WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let on = (message.body as? Bool) ?? false
        DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = on }
    }
}
