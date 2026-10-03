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
  // The day on screen, updated as soon as a new day starts, so a load or save
  // that began on a previous day can tell that its result is stale.
  const currentDay = useRef(day);
  // Only the most recent load may fill the screen.
  const loadSeq = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    clock.current = now;
  }, [now]);

  /** True when work begun on `forDay` may still change the screen. */
  const isCurrent = useCallback(
    (forDay: string) => mounted.current && currentDay.current === forDay,
    [],
  );

  // Drop the previous day's list before loading the new one, so a load that
  // fails on the new day shows no task as done and offers to try again.
  const startDay = useCallback((next: string) => {
    currentDay.current = next;
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

  const runLoad = useCallback(() => {
    const forDay = day;
    loadSeq.current += 1;
    const seq = loadSeq.current;
    const stillWanted = () => isCurrent(forDay) && loadSeq.current === seq;
    load().then(
      (loaded) => {
        if (stillWanted()) show(loaded);
      },
      (thrown: unknown) => {
        if (stillWanted()) setError(toAppError(thrown).code);
      },
    );
  }, [day, isCurrent, load, show]);

  useEffect(() => {
    runLoad();
  }, [runLoad]);

  const retryLoad = useCallback(() => {
    setError(null);
    runLoad();
  }, [runLoad]);

  const toggle = useCallback(
    (id: string) => {
      const forDay = day;
      const run = async () => {
        // A toggle queued on a day that has since ended does nothing.
        if (!isCurrent(forDay)) return;
        const today = dayKey(clock.current());
        if (today !== forDay) {
          // The list on screen belongs to a day that has ended. Load today's
          // list instead of writing to yesterday's entry.
          startDay(today);
          return;
        }
        const current = latest.current.find((task) => task.id === id);
        if (!current) return;
        const updated = { ...current, done: !current.done };
        const next = latest.current.map((task) => (task.id === id ? updated : task));
        setError(null);
        try {
          await api.save(updated);
          // Store first, so the screen never shows a state a reload would lose.
          await saveCompletion(
            forDay,
            next.filter((task) => task.done).map((task) => task.id),
          );
          // A save that finishes after the day changed must not bring back
          // yesterday's list or hide the new day's error.
          if (isCurrent(forDay)) show(next);
        } catch (thrown) {
          if (isCurrent(forDay)) setError(toAppError(thrown).code);
        }
      };
      queue.current = queue.current.then(run);
      return queue.current;
    },
    [api, day, isCurrent, show, startDay],
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
