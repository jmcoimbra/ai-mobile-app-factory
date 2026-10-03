import { AppError, createApiClient, userMessageFor, USER_MESSAGES } from '@maf/error-contract';

import { demoChecklistFetch } from './checklist';

const client = createApiClient({
  baseUrl: 'demo://local',
  fetch: demoChecklistFetch,
  retry: { sleep: async () => {} },
});

async function codeOf(request: Promise<unknown>) {
  try {
    await request;
  } catch (thrown) {
    expect(thrown).toBeInstanceOf(AppError);
    return (thrown as AppError).code;
  }
  throw new Error('the request was expected to fail');
}

test('a PUT for a task not on the list fails with checklist.task_not_found', async () => {
  const code = await codeOf(
    client.request('PUT', '/checklist/today/tasks/sweep-floor', { id: 'sweep-floor', done: true }),
  );

  expect(code).toBe('checklist.task_not_found');
  expect(userMessageFor(code)).toBe(USER_MESSAGES['checklist.task_not_found']);
  expect(userMessageFor(code).title).toBe('That task is no longer on the checklist');
});

test('a PUT without a boolean done fails with request.invalid', async () => {
  const code = await codeOf(
    client.request('PUT', '/checklist/today/tasks/open-safe', { id: 'open-safe' }),
  );

  expect(code).toBe('request.invalid');
  expect(userMessageFor(code).title).toBe('Something in the request was not accepted');
});

test('a PUT whose body names another task fails with request.invalid', async () => {
  const code = await codeOf(
    client.request('PUT', '/checklist/today/tasks/open-safe', { id: 'count-float', done: true }),
  );

  expect(code).toBe('request.invalid');
});

test('an unknown route fails with resource.not_found', async () => {
  const code = await codeOf(client.request('GET', '/checklist/yesterday'));

  expect(code).toBe('resource.not_found');
  expect(userMessageFor(code).title).toBe('We could not find that');
});

test('the detail text of a demo error never reaches the user message', async () => {
  const code = await codeOf(
    client.request('PUT', '/checklist/today/tasks/sweep-floor', { id: 'sweep-floor', done: true }),
  );
  const { title, body } = userMessageFor(code);

  expect(`${title} ${body}`).not.toMatch(/sweep-floor|not on the list/);
});
