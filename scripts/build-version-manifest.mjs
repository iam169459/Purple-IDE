#!/usr/bin/env node
/**
 * Builds the release manifest consumed by the in-app updater.
 *
 * The git tag is the single source of truth for the version: `version` comes
 * from package.json and the release tag must be `v<version>`. Policy
 * (`critical`, `minimumVersion`, `notes`) lives in update-policy.json and
 * contains no version of its own, so the two can never drift.
 *
 * The generated file is uploaded to the matching GitHub release and read by
 * the app from `releases/latest/download/version.json`.
 *
 *   node scripts/build-version-manifest.mjs [vX.Y.Z]
 *   RELEASE_TAG=vX.Y.Z node scripts/build-version-manifest.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const expectedTag = `v${pkg.version}`;
const tag = (process.env.RELEASE_TAG || process.argv[2] || expectedTag).trim();

if (tag !== expectedTag) {
  console.error(
    `Refusing to build manifest: tag "${tag}" does not match package.json version (${expectedTag}).`,
  );
  process.exit(1);
}

const policyPath = path.join(root, 'update-policy.json');
const policy = fs.existsSync(policyPath)
  ? JSON.parse(fs.readFileSync(policyPath, 'utf8'))
  : {};

const [owner, repo] = (process.env.GITHUB_REPOSITORY || 'iam169459/Purple-IDE').split('/');
const releasesUrl = `https://github.com/${owner}/${repo}/releases/tag/${tag}`;

const manifest = {
  version: pkg.version,
  minimumVersion: typeof policy.minimumVersion === 'string' ? policy.minimumVersion : '0.0.0',
  critical: policy.critical === true,
  notes: typeof policy.notes === 'string' ? policy.notes : '',
  releasedAt: new Date().toISOString(),
  releasesUrl,
};

const outDir = path.join(root, 'dist', 'release');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'version.json');
fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`Wrote ${path.relative(root, outPath)}`);
console.log(JSON.stringify(manifest, null, 2));
