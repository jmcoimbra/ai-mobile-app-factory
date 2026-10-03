import { AppError } from '@maf/error-contract';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { checklistApiFor } from '@/shared/api/checklist';
import { renderWithProviders } from '@/shared/testing/render';

import { ChecklistScreen } from '../ChecklistScreen';
import { storageKeyFor } from '../completionStore';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The five tasks named in the spec, written out so a wrong demo title fails.
const SPEC_TASKS = [
  'Open the safe',
  'Check the fridge temperatures',
  'Count the float',
  'Review the roster',
  'Check the fire exits',
];

const today = () => new Date(2026, 9, 2, 8, 0);

beforeEach(async () => {
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('checklist lists the tasks of the day', async () => {
  await renderWithProviders(<ChecklistScreen api={checklistApiFor('')} now={today} />);

  expect(await screen.findByText('0 of 5 done')).toBeOnTheScreen();
  for (const title of SPEC_TASKS) {
    const box = screen.getByRole('checkbox', { name: title });
    expect(box).toBeOnTheScreen();
    expect(box).not.toBeChecked();
  }
  expect(screen.getAllByRole('checkbox')).toHaveLength(5);
});

test('toggling a task persists and survives a reload', async () => {
  const api = checklistApiFor('');
  const save = jest.spyOn(api, 'save');
  const first = await renderWithProviders(<ChecklistScreen api={api} now={today} />);

  await fireEvent.press(await screen.findByRole('checkbox', { name: 'Count the float' }));

  expect(await screen.findByText('1 of 5 done')).toBeOnTheScreen();
  expect(screen.getByRole('checkbox', { name: 'Count the float' })).toBeChecked();
  expect(save).toHaveBeenCalledWith({ id: 'count-float', title: 'Count the float', done: true });
  expect(JSON.parse((await AsyncStorage.getItem(storageKeyFor('2026-10-02'))) ?? '[]')).toEqual([
    'count-float',
  ]);

  await first.unmount();
  await renderWithProviders(<ChecklistScreen api={checklistApiFor('')} now={today} />);

  expect(await screen.findByText('1 of 5 done')).toBeOnTheScreen();
  expect(screen.getByRole('checkbox', { name: 'Count the float' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Open the safe' })).not.toBeChecked();
});

test('completion from another day does not carry over', async () => {
  await AsyncStorage.setItem(storageKeyFor('2026-10-01'), JSON.stringify(['open-safe']));

  await renderWithProviders(<ChecklistScreen api={checklistApiFor('')} now={today} />);

  expect(await screen.findByText('0 of 5 done')).toBeOnTheScreen();
});

test('a screen left open past midnight moves to the new day', async () => {
  let clock = new Date(2026, 9, 2, 23, 58);
  await renderWithProviders(<ChecklistScreen api={checklistApiFor('')} now={() => clock} />);

  await fireEvent.press(await screen.findByRole('checkbox', { name: 'Open the safe' }));
  expect(await screen.findByText('1 of 5 done')).toBeOnTheScreen();

  clock = new Date(2026, 9, 3, 0, 5);
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Count the float' }));

  expect(await screen.findByText('0 of 5 done')).toBeOnTheScreen();
  expect(screen.getByRole('checkbox', { name: 'Open the safe' })).not.toBeChecked();
  expect(JSON.parse((await AsyncStorage.getItem(storageKeyFor('2026-10-02'))) ?? '[]')).toEqual([
    'open-safe',
  ]);
  expect(await AsyncStorage.getItem(storageKeyFor('2026-10-03'))).toBeNull();
});

test('an offline load on a new day shows no task done and offers Try again', async () => {
  const listeners: ((state: AppStateStatus) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    listeners.push(listener);
    return { remove: () => undefined };
  });
  const api = checklistApiFor('');
  const listing = jest.spyOn(api, 'today');
  let clock = new Date(2026, 9, 2, 23, 58);
  await renderWithProviders(<ChecklistScreen api={api} now={() => clock} />);

  await fireEvent.press(await screen.findByRole('checkbox', { name: 'Open the safe' }));
  expect(await screen.findByText('1 of 5 done')).toBeOnTheScreen();
  expect(listeners.length).toBeGreaterThan(0);

  listing.mockRejectedValueOnce(new TypeError('Network request failed'));
  clock = new Date(2026, 9, 3, 0, 5);
  await act(async () => {
    for (const listener of [...listeners]) listener('active');
  });

  expect(await screen.findByText('You are offline')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  expect(
    screen.queryAllByRole('checkbox').filter((box) => box.props.accessibilityState?.checked),
  ).toHaveLength(0);
  expect(screen.queryByText('1 of 5 done')).toBeNull();
});

test('a failed save shows the catalog message and keeps the task undone', async () => {
  const api = checklistApiFor('');
  jest.spyOn(api, 'save').mockRejectedValue(new TypeError('Network request failed'));
  await renderWithProviders(<ChecklistScreen api={api} now={today} />);

  await fireEvent.press(await screen.findByRole('checkbox', { name: 'Open the safe' }));

  expect(await screen.findByText('You are offline')).toBeOnTheScreen();
  expect(screen.getByText('0 of 5 done')).toBeOnTheScreen();
  expect(screen.getByRole('checkbox', { name: 'Open the safe' })).not.toBeChecked();
});

test('a save rejected as not on the list shows the catalog message', async () => {
  const api = checklistApiFor('');
  jest.spyOn(api, 'save').mockRejectedValue(
    new AppError({
      code: 'checklist.task_not_found',
      status: 404,
      detail: 'task open-safe is not on the list',
    }),
  );
  await renderWithProviders(<ChecklistScreen api={api} now={today} />);

  await fireEvent.press(await screen.findByRole('checkbox', { name: 'Open the safe' }));

  expect(await screen.findByText('That task is no longer on the checklist')).toBeOnTheScreen();
  expect(screen.getByText('Refresh the checklist to see the current tasks.')).toBeOnTheScreen();
  expect(screen.queryByText(/not on the list/)).toBeNull();
  expect(screen.getByText('0 of 5 done')).toBeOnTheScreen();
});

test('a failed load offers Try again and recovers', async () => {
  const api = checklistApiFor('');
  const listing = jest.spyOn(api, 'today');
  listing.mockRejectedValueOnce(new TypeError('Network request failed'));
  await renderWithProviders(<ChecklistScreen api={api} now={today} />);

  expect(await screen.findByText('You are offline')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

  expect(await screen.findByText('0 of 5 done')).toBeOnTheScreen();
  expect(screen.queryByText('You are offline')).toBeNull();
  expect(listing).toHaveBeenCalledTimes(2);
});

test('a failed device write keeps the task undone', async () => {
  jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage full'));
  await renderWithProviders(<ChecklistScreen api={checklistApiFor('')} now={today} />);

  await fireEvent.press(await screen.findByRole('checkbox', { name: 'Open the safe' }));

  expect(await screen.findByText('Something went wrong')).toBeOnTheScreen();
  expect(screen.getByText('0 of 5 done')).toBeOnTheScreen();
  expect(screen.getByRole('checkbox', { name: 'Open the safe' })).not.toBeChecked();
});
