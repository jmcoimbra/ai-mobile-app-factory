import type { FetchLike } from '@maf/error-contract';

export interface ChecklistTask {
  id: string;
  title: string;
  done: boolean;
}

/** The tasks of the day. The same for every store. */
export const DEMO_TASKS: readonly Omit<ChecklistTask, 'done'>[] = [
  { id: 'open-safe', title: 'Open the safe' },
  { id: 'fridge-temperatures', title: 'Check the fridge temperatures' },
  { id: 'count-float', title: 'Count the float' },
  { id: 'review-roster', title: 'Review the roster' },
  { id: 'fire-exits', title: 'Check the fire exits' },
];

type DemoResponse = Awaited<ReturnType<FetchLike>>;

function respond(status: number, body: unknown, contentType = 'application/json'): DemoResponse {
  const text = body === undefined ? '' : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    text: async () => text,
  };
}

function problem(status: number, code: string, detail: string): DemoResponse {
  return respond(status, { type: 'about:blank', status, code, detail }, 'application/problem+json');
}

const TASK_PATH = /^\/checklist\/today\/tasks\/([^/]+)$/;

/**
 * An in-memory stand-in for the checklist service, shaped as `fetch` so it
 * runs behind the same API client a real service would. It keeps no
 * completion of its own: completion lives on the device.
 */
export const demoChecklistFetch: FetchLike = async (url, init) => {
  const path = url.replace(/^[a-z]+:\/\/[^/]*/i, '');

  if (init.method === 'GET' && path === '/checklist/today') {
    return respond(200, { tasks: DEMO_TASKS.map((task) => ({ ...task, done: false })) });
  }

  const match = TASK_PATH.exec(path);
  if (init.method === 'PUT' && match) {
    const id = decodeURIComponent(match[1] ?? '');
    const known = DEMO_TASKS.find((task) => task.id === id);
    if (!known) return problem(404, 'checklist.task_not_found', `task ${id} is not on the list`);
    const sent = JSON.parse(init.body ?? '{}') as Partial<ChecklistTask>;
    if (typeof sent.done !== 'boolean' || sent.id !== id) {
      return problem(422, 'request.invalid', 'a task needs its id and a boolean done');
    }
    return respond(200, { ...known, done: sent.done });
  }

  return problem(404, 'resource.not_found', `no demo route for ${init.method} ${path}`);
};
