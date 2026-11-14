// Copies the game's web files into www/ (what Capacitor packages into the app)
// and writes the AdMob app ID from ads.config.js into the Android project.
// The game lives in play/ (served by GitHub Pages at /play/); the repo root is the website.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');
const src = join(root, 'play');
const files = ['index.html', 'style.css', 'saves.js', 'ads.config.js', 'monetization.js', 'game.js', 'app.js'];
const dirs = ['fonts', 'music'];

// --- Ads config: check it, then hand the app ID to Android ---
const sandbox = { window: {} };
vm.runInNewContext(readFileSync(join(src, 'ads.config.js'), 'utf8'), sandbox);
const ads = sandbox.window.ADS_CONFIG;
// Each platform (Android = top level, iPhone = ads.IOS) has its own MODE and IDs.
function checkIds(label, cfg) {
  const ids = cfg && cfg[cfg.MODE];
  if (!ids || !['TEST', 'LIVE'].includes(cfg.MODE)) throw new Error(`ads.config.js (${label}): MODE must be 'TEST' or 'LIVE'`);
  const all = [ids.appId, ids.interstitial, ...Object.values(ids.rewarded || {})];
  if (all.some((v) => !v || /REPLACE_ME/.test(v))) throw new Error(`ads.config.js (${label}): ${cfg.MODE} still has REPLACE_ME values. Fill in your AdMob IDs first.`);
  if (!/^ca-app-pub-\d+~\d+$/.test(ids.appId)) throw new Error(`ads.config.js (${label}): appId should look like ca-app-pub-1234567890123456~1234567890 (with ~)`);
  if (cfg.MODE === 'LIVE' && all.some((v) => v.startsWith('ca-app-pub-3940256099942544'))) throw new Error(`ads.config.js (${label}): LIVE mode is still using Google sample/test IDs.`);
  return ids;
}
const ids = checkIds('Android', ads);
const iosIds = checkIds('iOS', ads.IOS);
const res = join(root, 'android', 'app', 'src', 'main', 'res', 'values');
mkdirSync(res, { recursive: true });
writeFileSync(join(res, 'admob.xml'), `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated from ads.config.js by scripts/build-web.mjs. Edit ads.config.js, not this file. -->
<resources>
    <string name="admob_app_id" translatable="false">${ids.appId}</string>
</resources>
`);
// iPhone: the App ID lives in Info.plist (GADApplicationIdentifier).
const plist = join(root, 'ios', 'App', 'App', 'Info.plist');
if (existsSync(plist)) {
  const before = readFileSync(plist, 'utf8');
  const after = before.replace(/(<key>GADApplicationIdentifier<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${iosIds.appId}$2`);
  if (after === before && !before.includes(iosIds.appId)) throw new Error('ios/App/App/Info.plist: GADApplicationIdentifier key missing.');
  if (after !== before) writeFileSync(plist, after);
}

// --- Web files ---
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const f of files) cpSync(join(src, f), join(out, f));
for (const d of dirs) cpSync(join(src, d), join(out, d), { recursive: true });
console.log(`www/ built: ${files.length} files + ${dirs.join(', ')} (ads: Android ${ads.MODE}, iOS ${ads.IOS.MODE})`);
