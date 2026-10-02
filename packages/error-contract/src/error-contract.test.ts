import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createApiClient, type FetchLike } from './api-client.ts';
import { AppError, appErrorFromResponse, toAppError } from './app-error.ts';
import { ERROR_CODES } from './codes.ts';
import { USER_MESSAGES } from './messages.ts';
import { retryDelayMs, withRetry } from './retry.ts';

function response(status: number, body: string, headers: Record<string, string> = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
    text: async () => body,
  };
}

const problemHeaders = { 'Content-Type': 'application/problem+json; charset=utf-8' };

describe('reading an error response', () => {
  test('parses a problem details response into an AppError', async () => {
    const body = JSON.stringify({
      type: 'https://example.com/problems/task-not-found',
      title: 'Task not found',
      status: 404,
      detail: 'task 42 does not exist in checklist 7',
      code: 'checklist.task_not_found',
    });

    const error = await appErrorFromResponse(response(404, body, problemHeaders));

    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'checklist.task_not_found');
    assert.equal(error.status, 404);
    assert.equal(error.type, 'https://example.com/problems/task-not-found');
    assert.equal(error.detail, 'task 42 does not exist in checklist 7');
    // The message is the code, so logging the error leaks no server text.
    assert.equal(error.message, 'checklist.task_not_found');
  });

  test('a problem with an unknown code falls back to the code of its status', async () => {
    const body = JSON.stringify({ type: 'about:blank', status: 409, code: 'made.up' });
    const error = await appErrorFromResponse(response(409, body, problemHeaders));
    assert.equal(error.code, 'resource.conflict');
  });

  test('falls back to a generic AppError when the body is not problem details', async () => {
    const cases = [
      response(500, '<html>Internal Server Error</html>', { 'content-type': 'text/html' }),
      response(500, '', {}),
      response(500, '{"oops": true}', { 'content-type': 'application/json' }),
      response(500, 'not json at all', problemHeaders),
      response(500, '[1, 2, 3]', problemHeaders),
    ];
    for (const failed of cases) {
      const error = await appErrorFromResponse(failed);
      assert.equal(error.code, 'server.error');
      assert.equal(error.status, 500);
      assert.equal(error.detail, undefined);
    }
  });

  test('reads Retry-After as seconds or as a date', async () => {
    const seconds = await appErrorFromResponse(response(429, '', { 'Retry-After': '7' }));
    assert.equal(seconds.retryAfterSeconds, 7);

    const now = Date.parse('2026-01-01T00:00:00Z');
    const dated = await appErrorFromResponse(
      response(503, '', { 'Retry-After': 'Thu, 01 Jan 2026 00:00:30 GMT' }),
      () => now,
    );
    assert.equal(dated.retryAfterSeconds, 30);
  });

  test('a failure with no response becomes a network error', () => {
    assert.equal(toAppError(new TypeError('Network request failed')).code, 'network.offline');
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    assert.equal(toAppError(abort).code, 'network.timeout');
    assert.equal(toAppError('a string').code, 'unknown');
  });
});

describe('retry', () => {
  const unavailable = () => new AppError({ code: 'server.unavailable', status: 503 });

  test('retries an idempotent request with backoff', async () => {
    const waits: number[] = [];
    let calls = 0;

    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw unavailable();
        return 'ok';
      },
      {
        method: 'PUT',
        baseDelayMs: 100,
        // The top of the jitter range, so the growth of the ceiling shows.
        random: () => 0.999,
        sleep: async (ms) => void waits.push(ms),
      },
    );

    assert.equal(result, 'ok');
    assert.equal(calls, 3);
    assert.equal(waits.length, 2);
    assert.ok(waits[0]! < 100 && waits[0]! >= 99, `first wait ${waits[0]}`);
    assert.ok(waits[1]! < 200 && waits[1]! >= 199, `second wait ${waits[1]}`);
  });

  test('gives up after the attempt limit and throws the last error', async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(
        async () => {
          calls += 1;
          throw unavailable();
        },
        { method: 'GET', maxAttempts: 3, sleep: async () => {} },
      ),
      (error: unknown) => error instanceof AppError && error.code === 'server.unavailable',
    );
    assert.equal(calls, 3);
  });

  test('never retries a non-idempotent request', async () => {
    for (const method of ['POST', 'PATCH', 'post']) {
      let calls = 0;
      await assert.rejects(
        withRetry(
          async () => {
            calls += 1;
            throw unavailable();
          },
          { method, sleep: async () => assert.fail('must not wait') },
        ),
      );
      assert.equal(calls, 1, `${method} ran ${calls} times`);
    }
  });

  test('does not retry an error that repeating cannot fix', async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(
        async () => {
          calls += 1;
          throw new AppError({ code: 'resource.not_found', status: 404 });
        },
        { method: 'GET', sleep: async () => assert.fail('must not wait') },
      ),
    );
    assert.equal(calls, 1);
  });

  test('waits at least as long as Retry-After asks', () => {
    const limited = new AppError({ code: 'rate.limited', status: 429, retryAfterSeconds: 4 });
    assert.equal(retryDelayMs(1, limited, { random: () => 0 }), 4000);
  });

  test('never waits longer than the cap without a Retry-After', () => {
    const delay = retryDelayMs(20, unavailable(), { maxDelayMs: 5000, random: () => 0.999 });
    assert.ok(delay < 5000);
  });
});

describe('api client', () => {
  test('retries a GET through the client and returns the body', async () => {
    let calls = 0;
    const fetch: FetchLike = async () => {
      calls += 1;
      return calls === 1 ? response(503, '') : response(200, '{"tasks": []}');
    };
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch,
      retry: { sleep: async () => {} },
    });

    assert.deepEqual(await client.request('GET', '/checklist'), { tasks: [] });
    assert.equal(calls, 2);
  });

  test('sends a POST once even when the server is unavailable', async () => {
    let calls = 0;
    const fetch: FetchLike = async () => {
      calls += 1;
      return response(503, '');
    };
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch,
      retry: { sleep: async () => {} },
    });

    await assert.rejects(client.request('POST', '/checklist', { title: 'x' }));
    assert.equal(calls, 1);
  });

  test('a rejected fetch surfaces as an offline AppError', async () => {
    const fetch: FetchLike = async () => {
      throw new TypeError('Network request failed');
    };
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch,
      retry: { sleep: async () => {}, maxAttempts: 2 },
    });

    await assert.rejects(
      client.request('GET', '/checklist'),
      (error: unknown) => error instanceof AppError && error.code === 'network.offline',
    );
  });
});

describe('messages', () => {
  test('user message catalog covers every error code', () => {
    assert.deepEqual(Object.keys(USER_MESSAGES).sort(), [...ERROR_CODES].sort());
    for (const code of ERROR_CODES) {
      const message = USER_MESSAGES[code];
      assert.ok(message.title.length > 0 && message.body.length > 0, code);
      // Messages are for people: no status codes and no code identifiers.
      assert.doesNotMatch(`${message.title} ${message.body}`, /\b[45]\d\d\b|[a-z]+\.[a-z_]+/);
    }
  });
});
