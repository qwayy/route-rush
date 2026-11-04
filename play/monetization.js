// =====================================================================
// Route Rush: monetization module
// ---------------------------------------------------------------------
// The ONLY place that talks to ads and in-app purchases. Gameplay code
// calls these functions and never touches an ad or store SDK directly:
//
//   Monetization.showRewardedAd(placement, onRewarded, onCancelled)
//   Monetization.showInterstitialAd(onDone)
//   Monetization.maybeShowInterstitial(onDone)   // frequency rules below
//   Monetization.purchase(productId, onSuccess, onFail)
//   Monetization.restorePurchases(onDone)
//   Monetization.owns(productId)
//   Monetization.noteRunStart() / noteGameOver()
//
// ADS
//   Android app: real Google AdMob ads (rewarded + interstitial) through
//   @capacitor-community/admob. Every ID lives in ads.config.js (TEST/LIVE).
//   Consent (Google UMP) is gathered first; ads are preloaded so they show
//   instantly. onRewarded() runs only if the player finished the ad, after
//   it closes; closing early calls onCancelled('closed'). If no ad is ready,
//   the player sees "No ad available right now, try again soon" and nothing
//   else happens.
//   Web (GitHub Pages): clearly labeled placeholder overlays, as before.
// PURCHASES
//   Still placeholders (fake store dialog, nothing charged). LIVE: RevenueCat.
// =====================================================================
(function () {
  const PURCHASES_KEY = 'routeRush.purchases';
  const AD_STATE_KEY = 'routeRush.adState';

  const PRODUCTS = {
    remove_ads: { id: 'remove_ads', title: 'Remove Ads', price: '$2.99', type: 'nonconsumable', note: 'Removes interstitial ads. Optional rewarded ads stay available.' },
    coins_1000: { id: 'coins_1000', title: '1,000 coins', price: '$0.99', type: 'consumable', coins: 1000 },
    coins_6000: { id: 'coins_6000', title: '6,000 coins', price: '$4.99', type: 'consumable', coins: 6000 },
    coins_15000: { id: 'coins_15000', title: '15,000 coins', price: '$9.99', type: 'consumable', coins: 15000 },
  };

  const load = (key, fallback) => {
    try { const v = JSON.parse(SaveStore.get(key)); return v && typeof v === 'object' ? v : fallback; } catch (e) { return fallback; }
  };
  const save = (key, value) => SaveStore.set(key, JSON.stringify(value));   // Preferences in the app, localStorage on the web

  const state = {
    testMode: true,            // purchases (and web ads) are placeholders
    interstitialEvery: 3,      // at most one interstitial per this many game overs
    interstitialFreeRuns: 3,   // none during the player's first runs
    rewardedSeconds: 3,
    owned: load(PURCHASES_KEY, {}),
    ads: load(AD_STATE_KEY, { runs: 0, gameOversSinceAd: 0 }),
    busy: false,
    onAdOpen: null,            // the game mutes / pauses music while an ad is up
    onAdClose: null,
  };

  function configure(opts) { Object.assign(state, opts || {}); }
  function open() { state.busy = true; if (state.onAdOpen) state.onAdOpen(); }
  function close() { state.busy = false; if (state.onAdClose) state.onAdClose(); }

  // Short message at the bottom of the screen.
  function notice(text) {
    let el = document.getElementById('mz-notice');
    if (!el) { el = document.createElement('div'); el.id = 'mz-notice'; el.className = 'perf-toast'; document.body.appendChild(el); }
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(notice.timer);
    notice.timer = setTimeout(() => el.classList.remove('show'), 2800);
  }
  const NO_AD = 'No ad available right now, try again soon';

  // ===================================================================
  // AdMob (Android app only)
  // ===================================================================
  const cap = window.Capacitor;
  const AdMob = cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.AdMob;
  const CFG = window.ADS_CONFIG || {};
  const IDS = CFG[CFG.MODE] || {};
  const admob = {
    ready: false,           // consent gathered + SDK started: ads may be requested
    loaded: {},             // ad unit id -> a rewarded ad is ready
    loading: {},
    retryMs: {},            // ad unit id -> wait before the next load attempt
    inter: { loaded: false, loading: false },
    showing: null,          // { kind, earned, done } while an ad is on screen
    privacyRequired: false, // consent regions: settings must offer "Privacy options"
  };
  const RETRY_MIN = 15000, RETRY_MAX = 120000;
  const rewardedUnit = (placement) => (IDS.rewarded || {})[placement];
  const adOpts = (adId) => ({ adId, immersiveMode: true });

  function scheduleRetry(key, fn) {
    const ms = admob.retryMs[key] = Math.min(RETRY_MAX, (admob.retryMs[key] || RETRY_MIN / 2) * 2);
    setTimeout(fn, ms);
  }
  // Preload so the next ad shows instantly.
  function loadRewarded(adId) {
    if (!admob.ready || !adId || admob.loaded[adId] || admob.loading[adId]) return;
    admob.loading[adId] = true;
    AdMob.prepareRewardVideoAd(adOpts(adId)).then(() => {
      admob.loading[adId] = false; admob.loaded[adId] = true; admob.retryMs[adId] = 0;
    }).catch(() => {
      admob.loading[adId] = false;
      scheduleRetry(adId, () => loadRewarded(adId));
    });
  }
  function loadInterstitial() {
    const i = admob.inter, adId = IDS.interstitial;
    if (!admob.ready || !adId || i.loaded || i.loading || owns('remove_ads')) return;
    i.loading = true;
    AdMob.prepareInterstitial(adOpts(adId)).then(() => {
      i.loading = false; i.loaded = true; admob.retryMs.inter = 0;
    }).catch(() => {
      i.loading = false;
      scheduleRetry('inter', loadInterstitial);
    });
  }
  function preloadAll() {
    new Set(Object.values(IDS.rewarded || {})).forEach(loadRewarded);
    loadInterstitial();
  }

  // One ad on screen at a time; the result is handled when it closes.
  function finishShowing(failed) {
    const s = admob.showing;
    if (!s) return;
    admob.showing = null;
    close();
    s.done(failed ? 'failed' : s.earned ? 'earned' : 'closed');
    preloadAll();   // get the next one ready
  }
  function listen() {
    AdMob.addListener('onRewardedVideoAdReward', () => { if (admob.showing) admob.showing.earned = true; });
    AdMob.addListener('onRewardedVideoAdDismissed', () => finishShowing(false));
    AdMob.addListener('onRewardedVideoAdFailedToShow', () => finishShowing(true));
    AdMob.addListener('interstitialAdDismissed', () => finishShowing(false));
    AdMob.addListener('interstitialAdFailedToShow', () => finishShowing(true));
  }

  const RATING = { G: 'General', PG: 'ParentalGuidance' };
  async function startAdMob() {
    listen();
    // 1) Consent (Google UMP): shows Google's form where the law requires it.
    let canRequest = true;
    try {
      const req = { tagForUnderAgeOfConsent: !!CFG.underAgeOfConsent };
      if (CFG.consentDebugEEA) { req.debugGeography = 1; req.testDeviceIdentifiers = CFG.consentTestDeviceIds || []; }
      let info = await AdMob.requestConsentInfo(req);
      if (info.isConsentFormAvailable && info.status === 'REQUIRED') info = await AdMob.showConsentForm();
      canRequest = info.canRequestAds !== false;
      admob.privacyRequired = info.privacyOptionsRequirementStatus === 'REQUIRED';
      updatePrivacyButtons();
    } catch (e) {
      // No consent message set up (always the case with the sample app ID) or offline:
      // ads may still be requested; Google treats it as "consent not required".
    }
    if (!canRequest) return;
    // 2) Start the SDK with the audience settings.
    try {
      await AdMob.initialize({
        tagForChildDirectedTreatment: !!CFG.childDirected,
        tagForUnderAgeOfConsent: !!CFG.underAgeOfConsent,
        maxAdContentRating: RATING[CFG.maxAdContentRating] || 'General',
        initializeForTesting: (CFG.testDeviceIds || []).length > 0,
        testingDevices: CFG.testDeviceIds || [],
      });
    } catch (e) { return; }
    admob.ready = true;
    preloadAll();
  }
  function updatePrivacyButtons() {
    document.querySelectorAll('.privacy-btn').forEach((b) => b.classList.toggle('hidden', !admob.privacyRequired));
  }
  // "Privacy options" (settings), required in consent regions: reopens Google's form.
  function showPrivacyOptions() {
    if (!AdMob || state.busy) return;
    AdMob.showPrivacyOptionsForm().catch(() => {}).then(() => { if (!admob.ready) startAdMob(); });
  }
  if (AdMob) startAdMob();

  // --- Placeholder overlay (web only) ---
  function overlay(build) {
    const el = document.createElement('div');
    el.id = 'mz-overlay';
    el.className = 'mz-overlay';
    el.addEventListener('click', (e) => e.stopPropagation());
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.appendChild(el);
    build(el);
    return () => el.remove();
  }

  // Rewarded ad: the player chose to watch; reward only if it finishes.
  function showRewardedAd(placement, onRewarded, onCancelled) {
    if (state.busy) return;
    if (AdMob) {
      const adId = rewardedUnit(placement);
      if (!admob.ready || !admob.loaded[adId]) { notice(NO_AD); loadRewarded(adId); return; }   // nothing charged, nothing changes
      admob.loaded[adId] = false;
      open();
      admob.showing = {
        kind: 'rewarded', earned: false,
        done: (result) => {
          if (result === 'earned') { if (onRewarded) onRewarded(); }
          else if (result === 'failed') notice(NO_AD);
          else if (onCancelled) onCancelled('closed');
        },
      };
      AdMob.showRewardVideoAd(adOpts(adId)).catch(() => finishShowing(true));
      return;
    }
    if (!state.testMode) { notice(NO_AD); return; }
    open();
    let left = state.rewardedSeconds, timer = null;
    const done = overlay((el) => {
      el.innerHTML = `
        <div class="mz-box">
          <p class="mz-tag">PLACEHOLDER · TEST MODE</p>
          <h3>AD PLAYING</h3>
          <p class="mz-sub">(placeholder: no real ad)</p>
          <p class="mz-place">${String(placement).replace(/[<>&]/g, '')}</p>
          <p class="mz-count"><b>${left}</b></p>
          <button class="mz-btn mz-alt" type="button">✕ CLOSE (no reward)</button>
        </div>`;
      const count = el.querySelector('.mz-count b');
      el.querySelector('button').addEventListener('click', () => { clearInterval(timer); done(); close(); if (onCancelled) onCancelled('closed'); });
      timer = setInterval(() => {
        left--;
        count.textContent = left;
        if (left <= 0) { clearInterval(timer); done(); close(); if (onRewarded) onRewarded(); }
      }, 1000);
    });
  }

  // Interstitial: skipped entirely when "Remove Ads" is owned.
  function showInterstitialAd(onDone) {
    if (owns('remove_ads') || state.busy) { if (onDone) onDone(); return; }
    if (AdMob) {
      if (!admob.ready || !admob.inter.loaded) { loadInterstitial(); if (onDone) onDone(); return; }   // not ready: just carry on
      admob.inter.loaded = false;
      open();
      admob.showing = { kind: 'interstitial', earned: false, done: () => { if (onDone) onDone(); } };
      AdMob.showInterstitial().catch(() => finishShowing(true));
      return;
    }
    if (!state.testMode) { if (onDone) onDone(); return; }
    open();
    const done = overlay((el) => {
      el.innerHTML = `
        <div class="mz-box">
          <p class="mz-tag">PLACEHOLDER · TEST MODE</p>
          <h3>AD</h3>
          <p class="mz-sub">(placeholder interstitial: no real ad)</p>
          <button class="mz-btn" type="button" disabled>CLOSE ✕ <span>2</span></button>
        </div>`;
      const btn = el.querySelector('button'), sec = btn.querySelector('span');
      let left = 2;
      const timer = setInterval(() => { left--; sec.textContent = left; if (left <= 0) { clearInterval(timer); btn.disabled = false; sec.remove(); } }, 1000);
      btn.addEventListener('click', () => { done(); close(); if (onDone) onDone(); });
    });
  }

  // Frequency rules: never in the first runs, at most once every N game overs.
  // (The game only asks from the WIPEOUT screen: never during a ride, a
  // cutscene or the tutorial.)
  function noteRunStart() { state.ads.runs++; save(AD_STATE_KEY, state.ads); }
  function noteGameOver() { state.ads.gameOversSinceAd++; save(AD_STATE_KEY, state.ads); }
  function maybeShowInterstitial(onDone) {
    const a = state.ads;
    if (owns('remove_ads') || a.runs <= state.interstitialFreeRuns || a.gameOversSinceAd < state.interstitialEvery) { if (onDone) onDone(); return; }
    if (AdMob && !(admob.ready && admob.inter.loaded)) { loadInterstitial(); if (onDone) onDone(); return; }   // try again next game over
    a.gameOversSinceAd = 0;
    save(AD_STATE_KEY, a);
    showInterstitialAd(onDone);
  }

  // Purchases
  function purchase(productId, onSuccess, onFail) {
    const p = PRODUCTS[productId];
    if (!p) { if (onFail) onFail('unknown product'); return; }
    if (p.type === 'nonconsumable' && owns(productId)) { if (onFail) onFail('already owned'); return; }
    if (state.busy) return;
    if (!state.testMode) {
      // LIVE: RevenueCat purchasePackage(...) for productId; on success record entitlements, then onSuccess(p).
      if (onFail) onFail('store unavailable');
      return;
    }
    open();
    const done = overlay((el) => {
      el.innerHTML = `
        <div class="mz-box">
          <p class="mz-tag">PLACEHOLDER · TEST MODE</p>
          <h3>CONFIRM PURCHASE</h3>
          <p class="mz-place">${p.title} · ${p.price}</p>
          <p class="mz-sub">Fake store dialog: no real charge.</p>
          <div class="mz-row">
            <button class="mz-btn" type="button" data-a="buy">BUY</button>
            <button class="mz-btn mz-alt" type="button" data-a="cancel">CANCEL</button>
          </div>
        </div>`;
      el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        done(); close();
        if (b.dataset.a === 'buy') {
          if (p.type === 'nonconsumable') { state.owned[p.id] = true; save(PURCHASES_KEY, state.owned); }
          if (onSuccess) onSuccess(p);
        } else if (onFail) onFail('cancelled');
      }));
    });
  }

  function restorePurchases(onDone) {
    // LIVE: RevenueCat restorePurchases(); copy active entitlements into state.owned.
    state.owned = load(PURCHASES_KEY, {});
    if (onDone) onDone(Object.keys(state.owned).filter((k) => state.owned[k]));
  }

  function owns(productId) { return !!state.owned[productId]; }

  document.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('.privacy-btn')) return;
    e.stopPropagation();
    showPrivacyOptions();
  }, true);

  window.Monetization = {
    PRODUCTS, configure, showRewardedAd, showInterstitialAd, maybeShowInterstitial,
    noteRunStart, noteGameOver, purchase, restorePurchases, owns,
    isBusy: () => state.busy, testMode: () => state.testMode,
    adStatus: () => ({ native: !!AdMob, mode: CFG.MODE, ready: admob.ready, rewarded: { ...admob.loaded }, interstitial: admob.inter.loaded, privacyRequired: admob.privacyRequired }),
  };
})();
