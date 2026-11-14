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
//   Release app: Google Play Billing through @capgo/native-purchases. Product
//   IDs in Play Console must match PRODUCTS below. Coins are granted and saved
//   BEFORE the purchase is consumed, and unfinished purchases are picked up
//   again at launch, so a crash mid-purchase never loses what was paid for.
//   Debug builds and the web: the fake store dialog (nothing charged).
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
    onGrant: null,             // (product) => the game adds coins / refreshes the shop
  };

  function configure(opts) { Object.assign(state, opts || {}); if (Store && !state.testMode) startStore(); }
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
  const isIOS = !!(cap && cap.getPlatform && cap.getPlatform() === 'ios');
  const CFG = window.ADS_CONFIG || {};
  const PCFG = (isIOS ? CFG.IOS : CFG) || {};   // this platform's MODE / TEST / LIVE
  // Debug builds (installed over USB) always get Google's test units, so tapping
  // ads while developing can never count as invalid clicks on the live account.
  const isRelease = !!(window.RRNative && window.RRNative.isRelease && window.RRNative.isRelease());
  const IDS = (isRelease ? PCFG[PCFG.MODE] : PCFG.TEST) || {};
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
    // iPhone: Apple's "Allow tracking?" prompt (App Tracking Transparency), once,
    // after Google's consent form. Ads still work if the player says no.
    if (isIOS) {
      try {
        const t = await AdMob.trackingAuthorizationStatus();
        if (t.status === 'notDetermined') await AdMob.requestTrackingAuthorization();
      } catch (e) { /* older iOS: nothing to ask */ }
    }
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

  // ===================================================================
  // Google Play Billing (release app only)
  // ===================================================================
  const Store = cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.NativePurchases;
  const GRANTED_KEY = 'routeRush.iapGranted';   // purchase tokens already paid out (consumables)
  const store = { started: false, granted: load(GRANTED_KEY, { tokens: [] }) };

  // Pay out one Play purchase exactly once, then finish it with Google.
  // Order matters: save what the player got first, then consume/acknowledge.
  async function settle(tx, announce) {
    const p = PRODUCTS[tx.productIdentifier];
    if (!p || tx.purchaseState !== '1' || !tx.purchaseToken) return null;   // unknown, or payment still pending
    if (p.type === 'nonconsumable') {
      const isNew = !state.owned[p.id];
      state.owned[p.id] = true;
      save(PURCHASES_KEY, state.owned);
      if (isNew && state.onGrant) state.onGrant(p, announce);
      if (!tx.isAcknowledged) await Store.acknowledgePurchase({ purchaseToken: tx.purchaseToken }).catch(() => {});
      return p;
    }
    const tokens = store.granted.tokens;
    let paid = false;
    if (!tokens.includes(tx.purchaseToken)) {
      tokens.push(tx.purchaseToken);
      if (tokens.length > 100) tokens.splice(0, tokens.length - 100);
      save(GRANTED_KEY, store.granted);
      if (state.onGrant) state.onGrant(p, announce);
      paid = true;
    }
    await Store.consumePurchase({ purchaseToken: tx.purchaseToken }).catch(() => {});   // retried next launch if this fails
    return paid ? p : null;
  }

  // Everything Play says this player owns: Remove Ads, plus any coin pack that
  // was paid for but never finished (app closed mid-purchase, slow payment).
  async function syncPurchases(announce) {
    const { purchases } = await Store.getPurchases({ productType: 'inapp' });
    const got = [];
    for (const tx of purchases || []) { const p = await settle(tx, announce); if (p) got.push(p); }
    // A refunded Remove Ads disappears from Play's list. (A failed query
    // throws instead, so a network error never takes it away.)
    if (state.owned.remove_ads && !(purchases || []).some((tx) => tx.productIdentifier === 'remove_ads' && tx.purchaseState === '1')) {
      state.owned.remove_ads = false;
      save(PURCHASES_KEY, state.owned);
    }
    return got;
  }

  function startStore() {
    if (store.started) return;
    store.started = true;
    // Local prices ("$2.99", "2,99 €") straight from Play.
    Store.getProducts({ productIdentifiers: Object.keys(PRODUCTS), productType: 'inapp' }).then(({ products }) => {
      for (const sp of products || []) if (PRODUCTS[sp.identifier] && sp.priceString) PRODUCTS[sp.identifier].price = sp.priceString;
    }).catch(() => {});
    syncPurchases(true).catch(() => {});
    // Coming back to the app may finish a pending payment.
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !state.busy) syncPurchases(true).catch(() => {}); });
  }

  async function playPurchase(p, onSuccess, onFail) {
    open();
    try {
      const tx = await Store.purchaseProduct({
        productIdentifier: p.id, productType: 'inapp',
        isConsumable: p.type === 'consumable', autoAcknowledgePurchases: false,   // settle() finishes it after saving
      });
      const got = await settle(tx, false);
      close();
      if (got || p.type === 'nonconsumable') { if (onSuccess) onSuccess(p); }
      else if (onFail) onFail(tx.purchaseState === '0' ? 'pending' : 'failed');
    } catch (e) {
      close();
      const code = (e && e.code) || '', msg = (e && e.message) || '';
      if (code === 'USER_CANCELED') { if (onFail) onFail('cancelled'); }
      else if (code === 'ITEM_ALREADY_OWNED') {   // paid before: pick it up instead of failing
        syncPurchases(false).then(() => { if (owns(p.id)) { if (onSuccess) onSuccess(p); } else if (onFail) onFail('failed'); }).catch(() => { if (onFail) onFail('failed'); });
      } else if (/pending/i.test(msg)) { if (onFail) onFail('pending'); }
      else if (onFail) onFail('store unavailable');
    }
  }

  // Purchases
  function purchase(productId, onSuccess, onFail) {
    const p = PRODUCTS[productId];
    if (!p) { if (onFail) onFail('unknown product'); return; }
    if (p.type === 'nonconsumable' && owns(productId)) { if (onFail) onFail('already owned'); return; }
    if (state.busy) return;
    if (!state.testMode) {
      if (Store) { playPurchase(p, onSuccess, onFail); return; }
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
    if (Store && !state.testMode) {
      const list = () => Object.keys(state.owned).filter((k) => state.owned[k]).map((k) => (PRODUCTS[k] || {}).title || k);
      syncPurchases(true).then(() => { if (onDone) onDone(list()); }).catch(() => { if (onDone) onDone(null); });
      return;
    }
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
    adStatus: () => ({ native: !!AdMob, mode: PCFG.MODE, ready: admob.ready, rewarded: { ...admob.loaded }, interstitial: admob.inter.loaded, privacyRequired: admob.privacyRequired }),
  };
})();
