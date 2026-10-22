package com.qwaysarproductions.routerush;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Map;
import org.json.JSONObject;

// Small native helpers for the game, exposed to the page as window.RRNative.
// It is a plain JavaScript interface (not an async plugin call) so the game can
// read its saves synchronously before it starts. Added in load(), which runs
// before the WebView loads the page.
@CapacitorPlugin(name = "RRShell")
public class RRShellPlugin extends Plugin {

    // Same storage the @capacitor/preferences plugin writes to (its default group).
    private static final String PREFS_GROUP = "CapacitorStorage";

    @Override
    public void load() {
        getBridge().getWebView().addJavascriptInterface(new Js(), "RRNative");
    }

    private class Js {

        // All saved values as a JSON object of strings.
        @JavascriptInterface
        public String getSaves() {
            JSONObject out = new JSONObject();
            Map<String, ?> all = getContext().getSharedPreferences(PREFS_GROUP, Context.MODE_PRIVATE).getAll();
            for (Map.Entry<String, ?> e : all.entrySet()) {
                if (e.getValue() instanceof String) {
                    try {
                        out.put(e.getKey(), e.getValue());
                    } catch (Exception ignored) {}
                }
            }
            return out.toString();
        }

        // true in the signed Play build (not debuggable): the game hides debug tools and test labels.
        @JavascriptInterface
        public boolean isRelease() {
            return (getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) == 0;
        }

        // Keep the screen on while riding; menus let it sleep.
        @JavascriptInterface
        public void keepAwake(boolean on) {
            getActivity().runOnUiThread(() -> {
                if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }
    }
}
