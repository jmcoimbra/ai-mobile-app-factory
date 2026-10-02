/**
 * The three version fields of a build, derived from one release tag.
 * Nothing in the repository stores them: see docs/adr/0004.
 */
export interface AppVersion {
  /** User-facing version: CFBundleShortVersionString and versionName. */
  version: string;
  /** iOS CFBundleVersion. */
  buildNumber: string;
  /** Android versionCode. */
  versionCode: number;
}

export const MAX_MAJOR = 2099;
export const MAX_MINOR = 999;
export const MAX_PATCH = 999;

/** A build outside a release: a pull request preview or a local run. Never submitted. */
export const PREVIEW_VERSION: AppVersion = { version: '0.0.0', buildNumber: '1', versionCode: 1 };

// vMAJOR.MINOR.PATCH, no leading zeros, no pre-release or build suffix.
const RELEASE_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export class InvalidReleaseTagError extends Error {
  constructor(tag: string, reason: string) {
    super(`"${tag}" is not a release tag: ${reason}`);
    this.name = 'InvalidReleaseTagError';
  }
}

/**
 * Derive the version fields from a release tag.
 *
 * Accepted tags are a subset of SemVer: `vMAJOR.MINOR.PATCH` with major up
 * to 2099 and minor and patch up to 999. Inside that range the mapping to
 * versionCode is one-to-one, grows with the version, and stays under the
 * Google Play ceiling of 2100000000.
 */
export function deriveVersion(tag: string): AppVersion {
  const match = RELEASE_TAG.exec(tag);
  if (!match) {
    throw new InvalidReleaseTagError(tag, 'expected vMAJOR.MINOR.PATCH with no suffix');
  }
  const [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (major > MAX_MAJOR) throw new InvalidReleaseTagError(tag, `major is above ${MAX_MAJOR}`);
  if (minor > MAX_MINOR) throw new InvalidReleaseTagError(tag, `minor is above ${MAX_MINOR}`);
  if (patch > MAX_PATCH) throw new InvalidReleaseTagError(tag, `patch is above ${MAX_PATCH}`);
  if (major === 0 && minor === 0 && patch === 0) {
    throw new InvalidReleaseTagError(tag, '0.0.0 is reserved for preview builds');
  }

  const versionCode = major * 1_000_000 + minor * 1_000 + patch;
  return { version: `${major}.${minor}.${patch}`, buildNumber: String(versionCode), versionCode };
}

/**
 * The version of the build being configured. The release workflow sets
 * APP_VERSION to the tag; without it the build is a preview. An invalid tag
 * throws, so a release never falls back to preview numbers in silence.
 */
export function versionFromEnv(env: Record<string, string | undefined>): AppVersion {
  const tag = env.APP_VERSION?.trim();
  return tag ? deriveVersion(tag) : PREVIEW_VERSION;
}
