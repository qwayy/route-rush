// npm run phone
// Rebuilds the web files, syncs them into the Android project, builds a debug
// APK, installs it on the phone and starts the app. Saves on the phone are kept.
// Phone: R5CY5384ZPY by default; another one with PHONE_SERIAL=<serial>.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const serial = process.env.PHONE_SERIAL || 'R5CY5384ZPY';
const appId = 'com.qwaysarproductions.routerush';
const win = process.platform === 'win32';
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
const adb = sdk && existsSync(join(sdk, 'platform-tools', win ? 'adb.exe' : 'adb')) ? join(sdk, 'platform-tools', win ? 'adb.exe' : 'adb') : 'adb';
const apk = join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

function run(label, cmd, args, cwd = root) {
  console.log(`\n== ${label}`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: win });
  if (r.status !== 0) { console.error(`\n${label} failed (exit ${r.status}).`); process.exit(r.status || 1); }
}

const devices = spawnSync(adb, ['devices'], { encoding: 'utf8' }).stdout || '';
if (!new RegExp(`^${serial}\\s+device\\b`, 'm').test(devices)) {
  console.error(`Phone ${serial} is not connected (or USB debugging isn't allowed).\nadb devices says:\n${devices}`);
  process.exit(1);
}
run('Build web files', 'node', [join('scripts', 'build-web.mjs')]);
run('Sync into Android project', 'npx', ['cap', 'sync', 'android']);
run('Build debug APK', `"${join(root, 'android', win ? 'gradlew.bat' : 'gradlew')}"`, ['assembleDebug'], join(root, 'android'));
run(`Install on ${serial}`, `"${adb}"`, ['-s', serial, 'install', '-r', `"${apk}"`]);
run('Start the app', `"${adb}"`, ['-s', serial, 'shell', 'am', 'start', '-n', `${appId}/.MainActivity`]);
console.log('\nDone: Route Rush KC is running on the phone.');
