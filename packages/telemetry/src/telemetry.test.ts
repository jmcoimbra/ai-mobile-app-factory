import assert from 'node:assert/strict';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, test } from 'node:test';

import { createMemoryAdapter } from './adapters/basic.ts';
import { createOtlpAdapter } from './adapters/otlp.ts';
import { createSentryAdapter, scrubSentryEvent } from './adapters/sentry.ts';
import { configureTelemetry } from './configure.ts';
import { redactText, sanitizeAttributes, stackFrames } from './pii.ts';
import { createTelemetry } from './port.ts';

const SECRET_DETAIL = 'task 42 of maria.silva@example.com failed on db-replica-3';

class FakeAppError extends Error {
  readonly code = 'server.unavailable';
  readonly status = 503;
  readonly detail = SECRET_DETAIL;
  constructor() {
    super(SECRET_DETAIL);
    this.name = 'AppError';
  }
}

describe('defaults', () => {
  test('noop adapter is the default when nothing is configured', async () => {
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      return new Response();
    }) as typeof fetch;
    try {
      const telemetry = configureTelemetry();
      assert.deepEqual(telemetry.adapterNames, ['noop']);

      telemetry.captureError(new Error('boom'));
      telemetry.trackEvent('screen.view', { screen: 'home' });
      await telemetry.withSpan('load', async () => 1);
      await telemetry.flush();
      assert.deepEqual(calls, []);

      // An empty endpoint is the same as no endpoint.
      assert.deepEqual(configureTelemetry({ otlpEndpoint: '' }).adapterNames, ['noop']);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('pii guard', () => {
  test('drops attributes that are not on the allowlist', () => {
    const memory = createMemoryAdapter();
    const telemetry = createTelemetry({ adapters: [memory] });

    telemetry.trackEvent('checklist.task_toggled', {
      screen: 'checklist',
      result: 'done',
      userEmail: 'maria.silva@example.com',
      employeeId: 'E-99812',
      storeName: 'Downtown',
      nested: { email: 'x@example.com' },
    });

    assert.deepEqual(memory.events[0]?.attributes, { screen: 'checklist', result: 'done' });
  });

  test('an allowed key still has its text redacted', () => {
    const clean = sanitizeAttributes({ screen: 'profile of maria.silva@example.com' });
    assert.equal(clean.screen, 'profile of [email]');
  });

  test('never forwards server detail or exception messages by default', () => {
    const memory = createMemoryAdapter();
    const telemetry = createTelemetry({ adapters: [memory] });

    telemetry.captureError(new FakeAppError(), { screen: 'checklist' });

    const record = memory.errors[0];
    assert.ok(record);
    assert.equal(record.code, 'server.unavailable');
    assert.equal(record.status, 503);
    assert.equal(record.type, 'AppError');
    assert.equal(record.message, undefined);
    assert.ok(record.frames.length > 0, 'stack frames are kept');
    // Nothing of the free text survives anywhere in the record.
    const serialised = JSON.stringify(record);
    assert.doesNotMatch(serialised, /maria|db-replica|task 42/);
  });

  test('redacts email addresses, phone numbers and long digit runs from free text', () => {
    assert.equal(redactText('contact maria.silva@example.com now'), 'contact [email] now');
    assert.equal(redactText('call +55 (19) 99999-1234 today'), 'call [number] today');
    assert.equal(redactText('badge 12345678901'), 'badge [number]');
    assert.equal(redactText('retry 3 of 5'), 'retry 3 of 5');
    assert.equal(redactText('x'.repeat(500)).length, 200);
  });

  test('messages are redacted when an adopter turns them on', () => {
    const memory = createMemoryAdapter();
    const telemetry = createTelemetry({ adapters: [memory], sendMessages: true });

    telemetry.captureError(new FakeAppError());

    assert.equal(memory.errors[0]?.message, 'task 42 of [email] failed on db-replica-3');
  });

  test('stack frames drop the message line and absolute path prefixes', () => {
    const stack = [
      'Error: secret maria.silva@example.com',
      '    at loadTasks (/Users/someone/code/app/src/features/checklist/api.ts:12:9)',
      '    at /Users/someone/code/app/node_modules/react/index.js:3:1',
    ].join('\n');

    assert.deepEqual(stackFrames(stack), [
      { function: 'loadTasks', file: 'src/features/checklist/api.ts', line: 12 },
      { function: '<anonymous>', file: 'node_modules/react/index.js', line: 3 },
    ]);
  });

  test('a frame outside the repository layout keeps no user name or query string', () => {
    const stack = [
      'Error: x',
      '    at boot (/Users/maria.silva/project/index.js:7:3)',
      '    at run (https://cdn.example.com/bundle.js?user=maria.silva@example.com:1:1)',
    ].join('\n');
    const files = stackFrames(stack).map((frame) => frame.file);
    assert.deepEqual(files, ['project/index.js', 'cdn.example.com/bundle.js']);
    assert.doesNotMatch(JSON.stringify(files), /maria/);
  });

  test('the session id is random per telemetry instance', () => {
    const first = createMemoryAdapter();
    const second = createMemoryAdapter();
    createTelemetry({ adapters: [first] }).trackEvent('app.start');
    createTelemetry({ adapters: [second] }).trackEvent('app.start');

    assert.match(first.events[0]!.sessionId, /^[0-9a-f]{32}$/);
    assert.notEqual(first.events[0]!.sessionId, second.events[0]!.sessionId);
  });
});

describe('port', () => {
  test('captureError forwards to the configured adapter', () => {
    const memory = createMemoryAdapter();
    const captured: Record<string, unknown>[] = [];
    const sentry = createSentryAdapter({
      captureEvent: (event) => void captured.push(event),
      addBreadcrumb: () => {},
    });
    const telemetry = createTelemetry({ adapters: [memory, sentry], now: () => 1_700_000_000_000 });

    telemetry.captureError(new FakeAppError(), { screen: 'checklist' });

    assert.equal(memory.errors.length, 1);
    assert.equal(captured.length, 1);
    const event = captured[0] as {
      exception: { values: { type: string; value: string }[] };
      tags: Record<string, unknown>;
    };
    assert.equal(event.exception.values[0]?.type, 'AppError');
    assert.equal(event.exception.values[0]?.value, 'server.unavailable');
    assert.equal(event.tags['error.code'], 'server.unavailable');
    assert.equal(event.tags.screen, 'checklist');
    assert.doesNotMatch(JSON.stringify(event), /maria|db-replica/);
  });

  test('an adapter that throws does not break the app or the other adapters', () => {
    const memory = createMemoryAdapter();
    const broken = {
      name: 'broken',
      captureError: () => {
        throw new Error('adapter down');
      },
      trackEvent: () => {
        throw new Error('adapter down');
      },
      recordSpan: () => {
        throw new Error('adapter down');
      },
    };
    const telemetry = createTelemetry({ adapters: [broken, memory] });

    telemetry.captureError(new Error('x'));
    telemetry.trackEvent('app.start');

    assert.equal(memory.errors.length, 1);
    assert.equal(memory.events.length, 1);
  });

  test('withSpan records duration and failure and rethrows', async () => {
    const memory = createMemoryAdapter();
    let clock = 1000;
    const telemetry = createTelemetry({ adapters: [memory], now: () => (clock += 50) });

    assert.equal(await telemetry.withSpan('checklist.load', async () => 'ok'), 'ok');
    await assert.rejects(
      telemetry.withSpan('checklist.save', async () => {
        throw new Error('nope');
      }),
      /nope/,
    );

    assert.equal(memory.spans[0]?.ok, true);
    assert.equal(memory.spans[0]!.endUnixMs - memory.spans[0]!.startUnixMs, 50);
    assert.equal(memory.spans[1]?.ok, false);
  });

  test('an event name that is not an identifier is replaced', () => {
    const memory = createMemoryAdapter();
    createTelemetry({ adapters: [memory] }).trackEvent('opened profile of maria@example.com');
    assert.equal(memory.events[0]?.name, 'invalid.name');
  });
});

describe('sentry scrubbing', () => {
  test('scrubs events the SDK captures by itself', () => {
    const scrubbed = scrubSentryEvent({
      message: SECRET_DETAIL,
      user: { email: 'maria.silva@example.com', ip_address: '10.0.0.1' },
      request: { url: 'https://api.example.com/users/42' },
      extra: { payload: SECRET_DETAIL },
      breadcrumbs: [
        { category: 'console', message: SECRET_DETAIL },
        { category: 'usage', message: 'screen.view' },
      ],
      exception: { values: [{ type: 'TypeError', value: SECRET_DETAIL }] },
    });

    assert.doesNotMatch(JSON.stringify(scrubbed), /maria|db-replica|10\.0\.0\.1|users\/42/);
    assert.deepEqual(scrubbed.breadcrumbs, [{ category: 'usage', message: 'screen.view' }]);
    assert.deepEqual(scrubbed.exception, { values: [{ type: 'TypeError', value: 'TypeError' }] });
  });
});

describe('otlp', () => {
  function readBody(request: IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
      let body = '';
      request.on('data', (chunk) => (body += chunk));
      request.on('end', () => resolve(body));
    });
  }

  test('otlp adapter exports a span to the configured endpoint', async () => {
    const received: { path: string; contentType: string; key: string; body: any }[] = [];
    const server = createServer(async (request, response) => {
      received.push({
        path: request.url ?? '',
        contentType: request.headers['content-type'] ?? '',
        key: String(request.headers['x-ingest-key'] ?? ''),
        body: JSON.parse(await readBody(request)),
      });
      response.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    try {
      const telemetry = createTelemetry({
        adapters: [
          createOtlpAdapter({
            endpoint: `http://127.0.0.1:${port}/`,
            serviceName: 'factory-reference',
            resource: { 'app.flavor': 'public' },
            headers: { 'x-ingest-key': 'test-key' },
          }),
        ],
        now: () => 1_700_000_000_000,
      });

      await telemetry.withSpan('checklist.load', async () => {}, { screen: 'checklist' });
      telemetry.trackEvent('screen.view', { screen: 'checklist', userEmail: 'a@example.com' });
      await telemetry.flush();

      const traces = received.find((request) => request.path === '/v1/traces');
      assert.ok(traces, 'a request reached /v1/traces');
      assert.equal(traces.contentType, 'application/json');
      assert.equal(traces.key, 'test-key');
      const resourceSpans = traces.body.resourceSpans[0];
      assert.deepEqual(resourceSpans.resource.attributes, [
        { key: 'service.name', value: { stringValue: 'factory-reference' } },
        { key: 'app.flavor', value: { stringValue: 'public' } },
      ]);
      const span = resourceSpans.scopeSpans[0].spans[0];
      assert.equal(span.name, 'checklist.load');
      assert.match(span.traceId, /^[0-9a-f]{32}$/);
      assert.match(span.spanId, /^[0-9a-f]{16}$/);
      assert.equal(span.startTimeUnixNano, '1700000000000000000');
      assert.equal(span.status.code, 1);
      assert.ok(
        span.attributes.some(
          (attribute: { key: string; value: { stringValue?: string } }) =>
            attribute.key === 'screen' && attribute.value.stringValue === 'checklist',
        ),
      );

      const logs = received.find((request) => request.path === '/v1/logs');
      assert.ok(logs, 'a request reached /v1/logs');
      const record = logs.body.resourceLogs[0].scopeLogs[0].logRecords[0];
      assert.deepEqual(record.body, { stringValue: 'screen.view' });
      assert.doesNotMatch(JSON.stringify(logs.body), /example\.com/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('a collector that is down does not throw into the app', async () => {
    const telemetry = createTelemetry({
      adapters: [
        createOtlpAdapter({
          endpoint: 'http://127.0.0.1:9',
          serviceName: 'factory-reference',
          fetch: async () => {
            throw new TypeError('connection refused');
          },
        }),
      ],
    });

    telemetry.trackEvent('app.start');
    await telemetry.flush();
  });
});
