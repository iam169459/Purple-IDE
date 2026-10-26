#!/usr/bin/env node
/**
 * Development launcher.
 *
 * `npx electron .` runs the prebuilt Electron.app whose bundle name is
 * "Electron", so macOS shows "Electron" in the menu bar and Dock. Packaged
 * builds use electron-builder's productName, but development has no such
 * bundle. This launcher creates a lightweight clone of the Electron bundle
 * with Purple IDE metadata, ad-hoc signs it, and runs the app from there.
 *
 * Non-macOS platforms simply exec the stock Electron binary.
 */
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const electronBinary = require('electron');

const run = (command, args) => execFileSync(command, args, { stdio: 'pipe' });

const launch = (binary) => {
  const child = spawn(binary, ['.', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
};

if (process.platform !== 'darwin') {
  launch(electronBinary);
} else {
  const sourceApp = path.dirname(path.dirname(path.dirname(electronBinary)));
  const cacheRoot = path.join(process.cwd(), 'node_modules', '.cache', 'purple-ide-dev');
  const appPath = path.join(cacheRoot, 'Purple IDE.app');
  const cachedBinary = path.join(appPath, 'Contents', 'MacOS', 'Purple IDE');
  const plistPath = path.join(appPath, 'Contents', 'Info.plist');
  const stampPath = path.join(cacheRoot, 'bundle-version');
  const electronVersion = require('electron/package.json').version;
  const stamp = `purple-ide-dev:${electronVersion}`;

  const bundleName = () => {
    try {
      return run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleName', plistPath]).toString().trim();
    } catch {
      return '';
    }
  };

  const cachedStamp = (() => {
    try { return fs.readFileSync(stampPath, 'utf8').trim(); } catch { return ''; }
  })();

  if (!fs.existsSync(cachedBinary) || bundleName() !== 'Purple IDE' || cachedStamp !== stamp) {
    fs.rmSync(appPath, { recursive: true, force: true });
    fs.mkdirSync(cacheRoot, { recursive: true });
    // APFS clone-copy keeps the first launch fast without duplicating 268 MB.
    try {
      run('cp', ['-Rc', sourceApp, appPath]);
    } catch {
      fs.cpSync(sourceApp, appPath, { recursive: true });
    }

    // electron-builder renames the packaged executable; mirror that here so
    // macOS reports the process (and therefore the app menu) as Purple IDE.
    fs.renameSync(
      path.join(appPath, 'Contents', 'MacOS', 'Electron'),
      path.join(appPath, 'Contents', 'MacOS', 'Purple IDE'),
    );

    for (const [key, value] of [
      ['CFBundleName', 'Purple IDE'],
      ['CFBundleDisplayName', 'Purple IDE'],
      ['CFBundleExecutable', 'Purple IDE'],
      ['CFBundleIdentifier', 'com.purplide.app'],
    ]) {
      try {
        run('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plistPath]);
      } catch {
        run('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${value}`, plistPath]);
      }
    }

    try { run('xattr', ['-cr', appPath]); } catch {}
    try {
      run('codesign', ['--force', '--sign', '-', appPath]);
    } catch (error) {
      console.warn('Purple IDE dev bundle could not be signed; falling back to stock Electron.', error?.message || '');
      launch(electronBinary);
      process.exit(0);
    }

    fs.writeFileSync(stampPath, `${stamp}\n`);
  }

  launch(cachedBinary);
}
