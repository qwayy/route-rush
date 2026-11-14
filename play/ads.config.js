// =====================================================================
// Route Rush KC: AdMob settings. THE ONLY FILE WITH AD IDs.
// ---------------------------------------------------------------------
// MODE 'TEST' uses Google's official sample IDs: ads show a "Test Ad" label,
// never pay, and are safe to click.
//   https://developers.google.com/admob/android/quick-start  (sample app ID)
//   https://developers.google.com/admob/android/test-ads     (demo ad units)
//
// TO GO LIVE: fill in every LIVE value with your own IDs from the AdMob
// console, set MODE to 'LIVE', then run `npm run phone` (or `npm run sync`).
// The App ID is copied into the Android project automatically on every build;
// a LIVE build refuses to run while any value still says REPLACE_ME.
//
// The web version (GitHub Pages) never shows real ads: it keeps the
// placeholder overlays. Debug builds (npm run phone) always use the TEST
// units, even in LIVE mode; only the signed Play build shows real ads.
// =====================================================================
const ADS_CONFIG = {
  MODE: 'LIVE',   // 'TEST' or 'LIVE'

  TEST: {
    appId: 'ca-app-pub-3940256099942544~3347511713',          // Google sample AdMob app ID (Android)
    rewarded: {
      keep_riding: 'ca-app-pub-3940256099942544/5224354917',  // Google demo: Rewarded
      double_coins: 'ca-app-pub-3940256099942544/5224354917',
      daily_spin: 'ca-app-pub-3940256099942544/5224354917',
    },
    interstitial: 'ca-app-pub-3940256099942544/1033173712',   // Google demo: Interstitial
  },

  LIVE: {
    appId: 'ca-app-pub-1305027238754867~2201982229',   // Route Rush KC (AdMob)
    rewarded: {
      keep_riding: 'ca-app-pub-1305027238754867/5908633807',  // "Rewarded" unit (one unit for all three)
      double_coins: 'ca-app-pub-1305027238754867/5908633807',
      daily_spin: 'ca-app-pub-1305027238754867/5908633807',
    },
    interstitial: 'ca-app-pub-1305027238754867/2631733775',   // "Interstitial" unit
  },

  // iPhone app: its own AdMob app + ad units (AdMob → Apps → Add app → iOS).
  // Same rules as above; the App ID goes into ios/App/App/Info.plist on build.
  IOS: {
    MODE: 'TEST',   // 'TEST' or 'LIVE'
    TEST: {
      appId: 'ca-app-pub-3940256099942544~1458002511',          // Google sample AdMob app ID (iOS)
      rewarded: {
        keep_riding: 'ca-app-pub-3940256099942544/1712485313',  // Google demo: Rewarded (iOS)
        double_coins: 'ca-app-pub-3940256099942544/1712485313',
        daily_spin: 'ca-app-pub-3940256099942544/1712485313',
      },
      interstitial: 'ca-app-pub-3940256099942544/4411468910',   // Google demo: Interstitial (iOS)
    },
    LIVE: {
      appId: 'REPLACE_ME',
      rewarded: {
        keep_riding: 'REPLACE_ME',
        double_coins: 'REPLACE_ME',
        daily_spin: 'REPLACE_ME',
      },
      interstitial: 'REPLACE_ME',
    },
  },

  // Audience / safety (apply in both modes)
  maxAdContentRating: 'PG',       // 'G' (general audiences) or 'PG' (parental guidance)
  childDirected: false,           // true = treat as child-directed (COPPA). Decide based on your audience.
  underAgeOfConsent: false,       // true = tag requests for users under the age of consent (EEA/UK)

  // Consent form testing: Google only shows it once a GDPR/US-states message
  // is set up for your REAL app in AdMob (Privacy & messaging). To preview it
  // from the US, set consentDebugEEA: true and add the hashed device ID that
  // logcat prints ("Use new ConsentDebugSettings.Builder().addTestDeviceHashedId(...)").
  consentDebugEEA: false,
  consentTestDeviceIds: [],

  // Optional: your phone's test-device ID (shown in logcat as "Use
  // RequestConfiguration.Builder().setTestDeviceIds(...)") so LIVE ad units
  // show test ads on it while you check a LIVE build.
  testDeviceIds: [],
};
if (typeof window !== 'undefined') window.ADS_CONFIG = ADS_CONFIG;
