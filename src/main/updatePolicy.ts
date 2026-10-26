/**
 * Pure update-policy helpers.
 *
 * Kept free of Electron imports so the rules can be exercised headlessly:
 * the release manifest (version.json) only decides whether an update is
 * required, while electron-updater remains responsible for downloading and
 * installing it.
 */

export interface VersionManifest {
  version?: string;
  minimumVersion?: string;
  critical?: boolean;
  notes?: string;
  releasedAt?: string;
  releasesUrl?: string;
}

/** Numeric segment comparison with an optional `v` prefix and prerelease suffix. */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string) => {
    const cleaned = value.trim().replace(/^v/i, '');
    const [core, ...rest] = cleaned.split('-');
    return {
      numbers: core.split('.').map(part => parseInt(part, 10) || 0),
      prerelease: rest.join('-'),
    };
  };
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < Math.max(left.numbers.length, right.numbers.length); i += 1) {
    const delta = (left.numbers[i] ?? 0) - (right.numbers[i] ?? 0);
    if (delta !== 0) return delta > 0 ? 1 : -1;
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

/** Semver-style prerelease ordering: a release sorts above its prereleases. */
function comparePrerelease(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const left = a.split('.');
  const right = b.split('.');
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const l = left[i];
    const r = right[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const lNumeric = /^\d+$/.test(l);
    const rNumeric = /^\d+$/.test(r);
    if (lNumeric && rNumeric) {
      const delta = Number(l) - Number(r);
      if (delta !== 0) return delta > 0 ? 1 : -1;
    } else if (lNumeric !== rNumeric) {
      return lNumeric ? -1 : 1;
    } else if (l !== r) {
      return l > r ? 1 : -1;
    }
  }
  return 0;
}

/**
 * A release is required when it is flagged critical or when the running
 * version predates the manifest's minimum supported version. A missing or
 * malformed manifest never forces an install.
 */
export function isRequiredUpdate(
  manifest: VersionManifest | null | undefined,
  currentVersion: string,
): boolean {
  if (!manifest) return false;
  if (manifest.critical === true) return true;
  if (typeof manifest.minimumVersion !== 'string' || !manifest.minimumVersion.trim()) return false;
  return compareVersions(currentVersion, manifest.minimumVersion) < 0;
}
