import assert from 'node:assert/strict';
import { test } from 'node:test';

import { judgeCiRuns, type CiRun } from '../src/adapters/github.ts';

const run = (id: number, status: string, conclusion: string | null, minute: number): CiRun => ({
  databaseId: id,
  status,
  conclusion,
  createdAt: `2026-10-03T01:${String(minute).padStart(2, '0')}:00Z`,
});

test('ci is pending until a run on the head commit has finished', () => {
  assert.deepEqual(judgeCiRuns([]), { state: 'pending' });
  assert.deepEqual(judgeCiRuns([run(1, 'queued', null, 1)]), { state: 'pending' });
  assert.deepEqual(
    judgeCiRuns([run(1, 'completed', 'success', 1), run(2, 'in_progress', null, 2)]),
    {
      state: 'pending',
    },
  );
  // Only a cancelled duplicate so far: the real run has not been listed yet.
  assert.deepEqual(judgeCiRuns([run(1, 'completed', 'cancelled', 1)]), { state: 'pending' });
});

test('a cancelled duplicate never decides the verdict', () => {
  assert.deepEqual(
    judgeCiRuns([run(1, 'completed', 'success', 1), run(2, 'completed', 'cancelled', 2)]),
    {
      state: 'done',
      runId: 1,
      ok: true,
    },
  );
  assert.deepEqual(
    judgeCiRuns([run(1, 'completed', 'cancelled', 1), run(2, 'completed', 'failure', 2)]),
    {
      state: 'done',
      runId: 2,
      ok: false,
    },
  );
});

test('the newest finished run decides, so a re-run that passed counts', () => {
  assert.deepEqual(
    judgeCiRuns([run(1, 'completed', 'failure', 1), run(2, 'completed', 'success', 5)]),
    {
      state: 'done',
      runId: 2,
      ok: true,
    },
  );
});
