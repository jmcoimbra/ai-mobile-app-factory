import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  InvalidReleaseTagError,
  MAX_MAJOR,
  MAX_MINOR,
  MAX_PATCH,
  PREVIEW_VERSION,
  deriveVersion,
  versionFromEnv,
} from './index.ts';

const PLAY_MAX_VERSION_CODE = 2_100_000_000;

test('derives version, buildNumber and versionCode from a release tag', () => {
  assert.deepEqual(deriveVersion('v1.4.2'), {
    version: '1.4.2',
    buildNumber: '1004002',
    versionCode: 1_004_002,
  });
  assert.deepEqual(deriveVersion('v0.1.0'), {
    version: '0.1.0',
    buildNumber: '1000',
    versionCode: 1_000,
  });
  assert.equal(deriveVersion('v12.30.456').versionCode, 12_030_456);
});

test('rejects a tag outside the accepted grammar', () => {
  const rejected = [
    '1.2.3', // no v
    'v1.2', // two parts
    'v1.2.3.4', // four parts
    'v1.2.3-rc.1', // pre-release
    'v1.2.3+build.5', // build metadata
    'v01.2.3', // leading zero
    'v1.02.3',
    'v1.2.x',
    'V1.2.3',
    ' v1.2.3',
    'v1.1000.0', // would collide with v2.0.0
    'v1.0.1000', // would collide with v1.1.0
    'v2100.0.0', // above the Google Play ceiling
    'v0.0.0', // reserved for previews
    '',
  ];
  for (const tag of rejected) {
    assert.throws(() => deriveVersion(tag), InvalidReleaseTagError, `accepted "${tag}"`);
  }
});

test('versionCode grows with every accepted version increment', () => {
  const ordered = [
    'v0.0.1',
    'v0.0.999',
    'v0.1.0',
    'v0.999.999',
    'v1.0.0',
    'v1.0.1',
    'v1.1.0',
    'v1.999.999',
    'v2.0.0',
    `v${MAX_MAJOR}.${MAX_MINOR}.${MAX_PATCH}`,
  ];
  const codes = ordered.map((tag) => deriveVersion(tag).versionCode);
  for (let index = 1; index < codes.length; index += 1) {
    assert.ok(codes[index]! > codes[index - 1]!, `${ordered[index]} did not grow`);
  }
  assert.ok(codes.at(-1)! <= PLAY_MAX_VERSION_CODE);
});

test('the mapping is one-to-one across the boundaries of each field', () => {
  const seen = new Map<number, string>();
  const edges = [0, 1, 2, 998, 999];
  for (const major of [0, 1, 2, MAX_MAJOR]) {
    for (const minor of edges) {
      for (const patch of edges) {
        if (major + minor + patch === 0) continue;
        const tag = `v${major}.${minor}.${patch}`;
        const { versionCode } = deriveVersion(tag);
        assert.equal(
          seen.get(versionCode),
          undefined,
          `${tag} collides with ${seen.get(versionCode)}`,
        );
        seen.set(versionCode, tag);
      }
    }
  }
});

test('a build with no release tag is a preview', () => {
  assert.deepEqual(versionFromEnv({}), PREVIEW_VERSION);
  assert.deepEqual(versionFromEnv({ APP_VERSION: '' }), PREVIEW_VERSION);
  assert.deepEqual(versionFromEnv({ APP_VERSION: 'v3.2.1' }).version, '3.2.1');
});

test('an invalid release tag fails the build instead of becoming a preview', () => {
  assert.throws(() => versionFromEnv({ APP_VERSION: 'v1.2.3-rc.1' }), InvalidReleaseTagError);
  assert.throws(() => versionFromEnv({ APP_VERSION: 'main' }), InvalidReleaseTagError);
});
