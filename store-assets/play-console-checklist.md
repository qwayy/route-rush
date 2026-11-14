# Route Rush KC: Google Play Console checklist

Answers below match how version 1.0.1 actually works:
- **Ads:** Google AdMob, rewarded and interstitial.
- **No accounts:** there's no login and no server of our own.
- **Saves:** stay on the phone.
- **Purchases:** Google Play Billing (Remove Ads + 3 coin packs). No server of our own: purchases are checked with Google Play on the phone.
- **Feedback:** the button opens the player's own email app.

Re-check these answers whenever that changes.

## Before you start
- **Developer account:** personal or organization, with identity verification. New *personal* accounts have had to run a **closed test with at least 12 testers for 14 days** before they can publish to production. Check the current rule in Play Console when you sign up.
- **Privacy policy URL (required):** apps with ads or the advertising ID must have one. It can be a page on GitHub Pages, for example `qwayy.github.io/route-rush/privacy.html`. It should say:
  - **Ads:** the app shows ads from Google AdMob.
  - **What AdMob collects:** the data listed in the Data safety section below, under Google's privacy policy.
  - **No developer server:** no accounts, and saves stay on the device.
  - **Feedback:** the feedback button opens the player's own email app.
  - **Contact:** an email address.
- **Contact email for the store listing:** this is shown publicly.
- **Before going live with ads:** make the real AdMob IDs and link the app in AdMob. See the ad ID section at the end.

## App content (Policy → App content)

### Privacy policy
Paste the URL.

### Ads
**"Yes, my app contains ads."**

### Advertising ID
**"Yes"**, the app uses the advertising ID (through the Google Mobile Ads SDK). Purposes: **Advertising or marketing**, **Analytics**, **Fraud prevention, security, and compliance**.

### App access
**"All functionality is available without special access"**. There's no login.

### Content rating (IARC questionnaire)
- **Category:** Game.
- **Violence:** no blood, no characters hurt. The rider wipes out (cartoon crash) and can break windows on houses (property damage, cartoon style). If a question asks about destruction of property or mild cartoon or fantasy violence, answer yes, mild and cartoon.
- **Sexual content, drugs, alcohol and tobacco:** No. (Game Day has tailgates and grills: no alcohol shown or mentioned.)
- **Gambling:** No. The Daily Spin is a free prize wheel: no money or coins are wagered, and nothing can be bought.
- **Language:** ⚠️ **Check the music.** The bundled song file is `play/music/shit-talking.mp3`.
  - **If it has profanity or crude lyrics:** you must answer yes. That raises the rating (likely Teen / PEGI 12–16) and rules out a kids audience.
  - **Alternatives:** use a clean version or a different track, or make the generated chiptune the default.
  - **Rights:** make sure you have the rights to distribute the song in an app.
- **User interaction:** players can't chat, share content or see other users. No location sharing.
- **Digital purchases:** **Yes** (in-app purchases through Google Play).

### Target audience and content
- **Recommended: 13+** (13–15, 16–17, 18+). This keeps the app out of the Families policy, and fits if the song has strong language.
- **If you include ages under 13:**
  - **Policy:** the Families policy applies.
  - **Ads:** they must be family-safe: set `childDirected: true` and `maxAdContentRating: 'G'` in `play/ads.config.js`. AdMob is a Families-certified SDK.
  - **Advertising ID:** for an all-kids audience, don't collect it. Remove the AD_ID permission from the manifest.
  - **Music:** must be clean.
- **"Could your app unintentionally appeal to children?":** the pixel-art style might. Answer honestly. If you say yes, Google may review it.

### News app
**No.** It's a game about delivering papers, not a news app.

### Data safety
The app itself collects nothing: saves stay on the device, and feedback goes through the player's own email app. **The Google Mobile Ads SDK collects and shares the following** (Google's AdMob disclosure page, SDK 25.5; this app uses the 25.4 line):

| Play category → type | Collected | Shared | Purposes | Optional? |
|---|---|---|---|---|
| **Location** → Approximate location (estimated from IP address) | Yes | Yes | Advertising or marketing, Analytics, Fraud prevention / security / compliance | No |
| **App activity** → App interactions (app launches, taps, video views) | Yes | Yes | Same three | No |
| **App info and performance** → Diagnostics | Yes | Yes | Same three | No |
| **Device or other IDs** → Device or other IDs (advertising ID, app set ID) | Yes | Yes | Same three | No |

- **Is all user data encrypted in transit?** Yes (TLS).
- **Can users request their data be deleted?** The app keeps no data off the device, and users can reset or delete the advertising ID in Android settings. Answer according to Play's wording at the time; most AdMob-only games answer "No".
- **Account creation:** none.
- **Independent security review:** No (optional).

### Government apps, financial features, health apps
No to all of them.

## Store listing (Grow → Store presence → Main store listing)
- **App name, short description and full description:** `store-assets/listing.txt`.
- **App icon:** `store-assets/icon-512.png` (512×512).
- **Feature graphic:** `store-assets/feature-graphic-1024x500.png`.
- **Phone screenshots:** `store-assets/screenshot-1…6-*.png` (1200×2010, portrait).
- **Category:** Game → Arcade.
- **Tags:** pick from Play's list (e.g. Casual, Arcade, Pixel art, Single player).

## Release (Test and release → closed or internal testing first)
- **Upload:** `android/app/build/outputs/bundle/release/app-release.aab`.
- **Play App Signing:** accept it (Google keeps the app signing key, and you keep the *upload* key in `D:\Android\keys`).
- **Release name:** 1.0.1 (code 2).
- **Every later upload:** increase `versionCode` in `android/app/build.gradle`.

## Before switching ads to LIVE: values to replace in `play/ads.config.js`
| Key | What it is | From AdMob console |
|---|---|---|
| `LIVE.appId` | AdMob **App ID** (has a `~`) | Apps → your app → App settings |
| `LIVE.rewarded.keep_riding` | Rewarded ad unit (has a `/`) | Ad units → Rewarded |
| `LIVE.rewarded.double_coins` | Rewarded ad unit | (can be the same unit as above, or separate units for separate reports) |
| `LIVE.rewarded.daily_spin` | Rewarded ad unit | |
| `LIVE.interstitial` | Interstitial ad unit | Ad units → Interstitial |
| `MODE` | change `'TEST'` to `'LIVE'` | |

Then rebuild (`npm run sync` then `gradlew bundleRelease`). The build stops if any LIVE value is still `REPLACE_ME` or still a Google test ID. Never click your own live ads. Add your phone to `testDeviceIds` to see test ads on it with live IDs.

## In-app products (Monetize with Play → Products → One-time products)
Create each one with **exactly** this Product ID (the app looks them up by ID), then **Activate** it:

| Product ID | Name | Price (USD) |
|---|---|---|
| `remove_ads` | Remove Ads | 2.99 |
| `coins_1000` | 1,000 Coins | 0.99 |
| `coins_6000` | 6,000 Coins | 4.99 |
| `coins_15000` | 15,000 Coins | 9.99 |

- Products can only be created after an AAB containing the billing library has been uploaded (any track).
- **Setup → License testing:** add your Gmail so your test purchases are free.
- The app must be installed **from Play** (internal or closed test link) for purchases to work. A build installed over USB shows "store not available".
