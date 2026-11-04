// Saved data: coins, unlocks, medals, settings, purchases, tutorial status.
// In the Android app it is kept in Capacitor Preferences (Android
// SharedPreferences, which survives WebView storage clean-ups); on the web it
// stays in localStorage. Reads are synchronous: the app's native side hands
// the saved values to the page before the game starts (RRNative.getSaves),
// and every write goes to Preferences.
(function () {
  const cap = window.Capacitor;
  const prefs = cap && cap.isNativePlatform && cap.isNativePlatform() && window.RRNative && cap.Plugins && cap.Plugins.Preferences;
  let cache = null;   // app only: key -> string, loaded from Preferences
  if (prefs) {
    try { cache = JSON.parse(window.RRNative.getSaves()) || {}; } catch (e) { cache = {}; }
    // Anything an older build left in this WebView's localStorage moves to Preferences once.
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('routeRush.') && !(k in cache)) { cache[k] = localStorage.getItem(k); prefs.set({ key: k, value: cache[k] }); }
      }
    } catch (e) { /* storage blocked */ }
  }
  window.SaveStore = {
    native: !!prefs,
    get(key) {
      if (cache) return Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : null;
      try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    set(key, value) {
      value = String(value);
      if (cache) { cache[key] = value; prefs.set({ key, value }).catch(() => { /* retried on the next save */ }); return; }
      try { localStorage.setItem(key, value); } catch (e) { /* storage blocked: ignore */ }
    },
  };
})();
