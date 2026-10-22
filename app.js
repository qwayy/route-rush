// Android app shell (Capacitor). Does nothing in a normal browser.
// - Tilt: Android lets apps read the motion sensor without asking, so tilt
//   starts listening right away (no "tap to enable").
// - Screen stays awake while riding; menus let it sleep.
// - Minimized / phone locked: pause the ride, silence all audio; sound comes
//   back when the app returns (the ride waits on the pause menu).
// - Back button: riding -> pause menu; menus -> back one screen; main menu ->
//   "Exit game?".
(function () {
  const cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;
  const App = cap.Plugins.App;
  const native = window.RRNative;
  document.documentElement.classList.add('native-app');

  // Tilt
  tilt.needsPermission = false;
  listenForTilt();
  updateSteerUI();

  // Screen awake only while riding
  let awake = null;
  setInterval(() => {
    const want = !document.hidden && (game.state === 'playing' || game.state === 'crashed');
    if (want !== awake && native) { awake = want; native.keepAwake(want); }
  }, 500);

  // Minimized / locked / back
  function appHidden() {
    pauseGame();
    pauseMusic();
    updatePedalSound(false);
    if (audio.ctx && audio.ctx.state === 'running') audio.ctx.suspend().catch(() => {});
    if (native) { awake = false; native.keepAwake(false); }
  }
  function appShown() {
    if (audio.ctx && audio.ctx.state !== 'running') audio.ctx.resume().catch(() => { /* resumes on the next tap */ });
    if (music.on && game.state !== 'paused') startMusic();
  }
  App.addListener('appStateChange', ({ isActive }) => (isActive ? appShown() : appHidden()));

  // Back button
  const el = (id) => document.getElementById(id);
  const shown = (id) => !el(id).classList.contains('hidden');
  const exitPanel = el('screen-exit');
  function toMainMenu() {   // same as pause -> MAIN MENU
    if (game.score > best) { best = game.score; storage.set(BEST_KEY, best); }
    checkUnlocks();
    pauseMusic();
    music.on = false;
    updatePedalSound(false);
    resetGame();
    showTitle();
  }
  App.addListener('backButton', () => {
    if (Monetization.isBusy()) return;   // an ad / store dialog is up
    const st = game.state;
    if (st === 'playing') { pauseGame(); return; }
    if (st === 'cutscene') { endCutscene(); return; }   // skip it
    if (st === 'paused') {
      if (shown('screen-feedback')) el('fb-back').click();
      else if (shown('pause-confirm')) el('quit-no').click();
      else if (!pauseUI.settings.classList.contains('hidden')) showPauseView('main');
      else resumeGame();
      return;
    }
    if (ui.overlay.classList.contains('hidden')) return;
    const panel = [...document.querySelectorAll('#overlay .panel')].find((p) => !p.classList.contains('hidden'));
    if (!panel) return;
    if (panel === exitPanel) { el('exit-no').click(); return; }
    const back = panel.querySelector('[id$="-back"]');   // menu screens: their BACK button
    if (back) { back.click(); return; }
    if (panel.id === 'screen-title') { sfx.click(); showPanel(exitPanel); return; }
    if (panel.id === 'screen-over' || panel.id === 'screen-day') toMainMenu();
  });
  el('exit-yes').addEventListener('click', (e) => { e.stopPropagation(); App.exitApp(); });
  el('exit-no').addEventListener('click', (e) => { e.stopPropagation(); sfx.click(); showPanel(ui.title); });
})();
