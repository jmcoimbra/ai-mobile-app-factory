import { createApiClient, type ApiClient, type FetchLike } from '@maf/error-contract';

import { demoChecklistFetch, type ChecklistTask } from './demo/checklist';

export type { ChecklistTask } from './demo/checklist';

export interface ChecklistApi {
  today(): Promise<ChecklistTask[]>;
  /** Sends the whole task state. PUT is idempotent, so the client may retry it. */
  save(task: ChecklistTask): Promise<ChecklistTask>;
}

export function createChecklistApi(client: ApiClient): ChecklistApi {
  return {
    today: async () =>
      (await client.request<{ tasks: ChecklistTask[] }>('GET', '/checklist/today')).tasks,
    save: (task) =>
      client.request<ChecklistTask>(
        'PUT',
        `/checklist/today/tasks/${encodeURIComponent(task.id)}`,
        task,
      ),
  };
}

const platformFetch: FetchLike = (url, init) => fetch(url, init);

/** The real service when `apiBaseUrl` is set, the demo API when it is empty. */
export function checklistApiFor(apiBaseUrl: string): ChecklistApi {
  const client = apiBaseUrl
    ? createApiClient({ baseUrl: apiBaseUrl, fetch: platformFetch })
    : createApiClient({ baseUrl: 'demo://local', fetch: demoChecklistFetch });
  return createChecklistApi(client);
}
