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
// Right now everything is a PLACEHOLDER: in test mode it shows clearly
// labeled fake overlays and always succeeds. Nothing is charged and no real
// ad is shown. To go live, replace the bodies marked "LIVE:" with Google
// AdMob (rewarded + interstitial) and RevenueCat (purchases / restore); the
// game code doesn't change.
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
    try { const v = JSON.parse(localStorage.getItem(key)); return v && typeof v === 'object' ? v : fallback; } catch (e) { return fallback; }
  };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked */ } };

  const state = {
    testMode: true,
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

  // --- Placeholder overlay (test mode only) ---
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
  function open() { state.busy = true; if (state.onAdOpen) state.onAdOpen(); }
  function close() { state.busy = false; if (state.onAdClose) state.onAdClose(); }

  // Rewarded ad: the player chose to watch; reward only if it finishes.
  function showRewardedAd(placement, onRewarded, onCancelled) {
    if (state.busy) return;
    if (!state.testMode) {
      // LIVE: AdMob rewarded ad for `placement`; call onRewarded() from its reward callback.
      if (onCancelled) onCancelled('unavailable');
      return;
    }
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
    if (!state.testMode) {
      // LIVE: AdMob interstitial; call onDone() when it's dismissed (or fails to load).
      if (onDone) onDone();
      return;
    }
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
  function noteRunStart() { state.ads.runs++; save(AD_STATE_KEY, state.ads); }
  function noteGameOver() { state.ads.gameOversSinceAd++; save(AD_STATE_KEY, state.ads); }
  function maybeShowInterstitial(onDone) {
    const a = state.ads;
    if (owns('remove_ads') || a.runs <= state.interstitialFreeRuns || a.gameOversSinceAd < state.interstitialEvery) { if (onDone) onDone(); return; }
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

  window.Monetization = {
    PRODUCTS, configure, showRewardedAd, showInterstitialAd, maybeShowInterstitial,
    noteRunStart, noteGameOver, purchase, restorePurchases, owns,
    isBusy: () => state.busy, testMode: () => state.testMode,
  };
})();
