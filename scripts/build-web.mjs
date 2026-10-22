// Copies the game's web files into www/ (what Capacitor packages into the app)
// and writes the AdMob app ID from ads.config.js into the Android project.
// The game itself stays in the repo root, which is what GitHub Pages serves.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');
const files = ['index.html', 'style.css', 'saves.js', 'ads.config.js', 'monetization.js', 'game.js', 'app.js'];
const dirs = ['fonts', 'music'];

// --- Ads config: check it, then hand the app ID to Android ---
const sandbox = { window: {} };
vm.runInNewContext(readFileSync(join(root, 'ads.config.js'), 'utf8'), sandbox);
const ads = sandbox.window.ADS_CONFIG;
const ids = ads && ads[ads.MODE];
if (!ids || !['TEST', 'LIVE'].includes(ads.MODE)) throw new Error(`ads.config.js: MODE must be 'TEST' or 'LIVE'`);
const all = [ids.appId, ids.interstitial, ...Object.values(ids.rewarded || {})];
if (all.some((v) => !v || /REPLACE_ME/.test(v))) throw new Error(`ads.config.js: ${ads.MODE} still has REPLACE_ME values. Fill in your AdMob IDs first.`);
if (!/^ca-app-pub-\d+~\d+$/.test(ids.appId)) throw new Error(`ads.config.js: appId should look like ca-app-pub-1234567890123456~1234567890 (with ~)`);
if (ads.MODE === 'LIVE' && all.some((v) => v.startsWith('ca-app-pub-3940256099942544'))) throw new Error('ads.config.js: LIVE mode is still using Google sample/test IDs.');
const res = join(root, 'android', 'app', 'src', 'main', 'res', 'values');
mkdirSync(res, { recursive: true });
writeFileSync(join(res, 'admob.xml'), `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated from ads.config.js by scripts/build-web.mjs. Edit ads.config.js, not this file. -->
<resources>
    <string name="admob_app_id" translatable="false">${ids.appId}</string>
</resources>
`);

// --- Web files ---
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const f of files) cpSync(join(root, f), join(out, f));
for (const d of dirs) cpSync(join(root, d), join(out, d), { recursive: true });
console.log(`www/ built: ${files.length} files + ${dirs.join(', ')} (ads: ${ads.MODE})`);
