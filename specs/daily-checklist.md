# Daily store checklist

A store manager opens the app at the start of a shift and works through
the tasks of the day: a short list, each task marked done with one tap,
with progress kept if the app is closed and reopened.

## Context

- The reference app has no backend yet. The checklist comes from the demo
  API in the app (`apps/reference/src/shared/api/`): an in-memory list of
  tasks for today, served through the same API client a real service would
  use (`@maf/error-contract`). When `apiBaseUrl` is empty, the app uses the
  demo API.
- Tasks are the same for every store: open the safe, check the fridge
  temperatures, count the float, review the roster, check the fire exits.
- Completion is stored on the device, keyed by the day, so it survives a
  reload and resets the next day.
- The screen uses the `Screen`, `AppText` and `Button` primitives and the
  theme tokens; new colours are not introduced.
- Toggling a task goes through the API client as a `PUT` of the whole task
  state, which the retry policy treats as idempotent.
- Every string a person reads is plain English; errors come from the
  message catalog.
- The home route (`src/app/index.tsx`) becomes the checklist screen.

## Acceptance criteria

- `checklist lists the tasks of the day`: rendering the checklist screen shows every task of the demo list with a checkbox role and its name as the accessible name, and a progress line such as "0 of 5 done".
- `toggling a task persists and survives a reload`: pressing a task marks it done, the progress line updates, and rendering the screen again from a fresh component reads the stored state and shows the task still done.
- `e2e: manager completes the daily checklist`: on a device, launching the app shows the checklist, tapping every task leaves the progress line at "5 of 5 done", and the flow asserts that text.

## Out of scope

- Sign-in, more than one store, editing the list of tasks, a real backend.
