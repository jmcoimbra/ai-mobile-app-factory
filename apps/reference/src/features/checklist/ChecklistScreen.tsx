import { toAppError, userMessageFor, type ErrorCode } from '@maf/error-contract';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { ChecklistApi, ChecklistTask } from '@/shared/api/checklist';
import { RETRY_LABEL } from '@/shared/errors/error-fallback';
import { AppText, Button, Screen } from '@/shared/ui';

import { dayKey, loadCompletion, saveCompletion } from './completionStore';

export const CHECKLIST_TITLE = 'Daily store checklist';

export function progressLine(tasks: readonly ChecklistTask[]): string {
  return `${tasks.filter((task) => task.done).length} of ${tasks.length} done`;
}

/** Milliseconds from `at` to the next local midnight, at least one second. */
function msUntilNextDay(at: Date): number {
  const midnight = new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1);
  return Math.max(1000, midnight.getTime() - at.getTime());
}

interface ChecklistScreenProps {
  api: ChecklistApi;
  /** Injected so tests can pin the day. */
  now?: () => Date;
}

const systemClock = () => new Date();

export function ChecklistScreen({ api, now = systemClock }: ChecklistScreenProps) {
  const [tasks, setTasks] = useState<ChecklistTask[] | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);
  // The latest list, read by toggles that land before the next render.
  const latest = useRef<ChecklistTask[]>([]);
  // Toggles run one after the other, so each one reads the result of the last.
  const queue = useRef<Promise<void>>(Promise.resolve());
  // Work that resolves after unmount must not set state.
  const mounted = useRef(true);
  const clock = useRef(now);
  const [day, setDay] = useState(() => dayKey(now()));

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    clock.current = now;
  }, [now]);

  // Drop the previous day's list before loading the new one, so a load that
  // fails on the new day shows no task as done and offers to try again.
  const startDay = useCallback((next: string) => {
    latest.current = [];
    setTasks(null);
    setError(null);
    setDay(next);
  }, []);

  // Move to the new day at local midnight, and when the app returns to the
  // foreground, since timers do not run while it is in the background.
  useEffect(() => {
    const rollOver = () => {
      const next = dayKey(clock.current());
      if (next !== day) startDay(next);
    };
    const timer = setTimeout(rollOver, msUntilNextDay(clock.current()));
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') rollOver();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [day, startDay]);

  const load = useCallback(async () => {
    const [listed, done] = await Promise.all([api.today(), loadCompletion(day)]);
    return listed.map((task) => ({ ...task, done: done.has(task.id) }));
  }, [api, day]);

  const show = useCallback((loaded: ChecklistTask[]) => {
    latest.current = loaded;
    setTasks(loaded);
  }, []);

  useEffect(() => {
    let active = true;
    load().then(
      (loaded) => {
        if (active) show(loaded);
      },
      (thrown: unknown) => {
        if (active) setError(toAppError(thrown).code);
      },
    );
    return () => {
      active = false;
    };
  }, [load, show]);

  const retryLoad = useCallback(() => {
    setError(null);
    load().then(
      (loaded) => {
        if (mounted.current) show(loaded);
      },
      (thrown: unknown) => {
        if (mounted.current) setError(toAppError(thrown).code);
      },
    );
  }, [load, show]);

  const toggle = useCallback(
    (id: string) => {
      const run = async () => {
        const today = dayKey(clock.current());
        if (today !== day) {
          // The list on screen belongs to a day that has ended. Load today's
          // list instead of writing to yesterday's entry.
          if (mounted.current) startDay(today);
          return;
        }
        const current = latest.current.find((task) => task.id === id);
        if (!current) return;
        const updated = { ...current, done: !current.done };
        const next = latest.current.map((task) => (task.id === id ? updated : task));
        if (mounted.current) setError(null);
        try {
          await api.save(updated);
          // Store first, so the screen never shows a state a reload would lose.
          await saveCompletion(
            day,
            next.filter((task) => task.done).map((task) => task.id),
          );
          if (mounted.current) show(next);
        } catch (thrown) {
          if (mounted.current) setError(toAppError(thrown).code);
        }
      };
      queue.current = queue.current.then(run);
      return queue.current;
    },
    [api, day, show, startDay],
  );

  const message = error ? userMessageFor(error) : null;

  return (
    <Screen>
      <AppText variant="title">{CHECKLIST_TITLE}</AppText>
      {tasks ? (
        <>
          <AppText tone="secondary">{progressLine(tasks)}</AppText>
          {tasks.map((task) => (
            <Button
              key={task.id}
              label={task.done ? `Done: ${task.title}` : task.title}
              accessibilityLabel={task.title}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: task.done }}
              onPress={() => void toggle(task.id)}
            />
          ))}
        </>
      ) : error ? null : (
        <AppText tone="secondary">Loading the checklist</AppText>
      )}
      {message ? (
        <>
          <AppText variant="label" tone="danger">
            {message.title}
          </AppText>
          <AppText tone="danger">{message.body}</AppText>
          {!tasks && message.canRetry ? <Button label={RETRY_LABEL} onPress={retryLoad} /> : null}
        </>
      ) : null}
    </Screen>
  );
}
