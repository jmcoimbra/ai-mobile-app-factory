import { basename, delimiter, dirname, resolve } from 'node:path';

/**
 * What the agent may not do, in one place. The file tools enforce these
 * while the agent works, and the verify node enforces them again on the
 * resulting diff, so a hole in one is caught by the other.
 */

/** How many times implement may run before a person is asked. */
export const MAX_ATTEMPTS = 3;

/**
 * Paths the agent cannot change. They execute at build time, decide what
 * gets installed, or define the pipeline that checks the agent's own work.
 * A person authors those changes.
 */
const PROTECTED_PATTERNS: readonly RegExp[] = [
  /^\.github\//,
  /^factory\//,
  /^tooling\//,
  /^docs\/(adr|spec)\//,
  /(^|\/)fastlane\//,
  /(^|\/)Gemfile(\.lock)?$/,
  /(^|\/)package\.json$/,
  /(^|\/)package-lock\.json$/,
  /(^|\/)app\.config\.[cm]?[jt]s$/,
  /(^|\/)app\.json$/,
  /(^|\/)metro\.config\.[cm]?[jt]s$/,
  /(^|\/)babel\.config\.[cm]?[jt]s$/,
  /(^|\/)eslint\.config\.[cm]?[jt]s$/,
  /(^|\/)plugins\//,
  /(^|\/)config\/flavors\.ts$/,
  /^release-please-config\.json$/,
  /^\.release-please-manifest\.json$/,
  /(^|\/)\.env(\..*)?$/,
  /(^|\/)\.npmrc$/,
  /^AGENTS\.md$/,
  /^CLAUDE\.md$/,
  /(^|\/)\.git(\/|$)/,
  /^\.factory(\/|$)/,
  /^\.factory-home(\/|$)/,
];

export function isProtectedPath(relativePath: string): boolean {
  const normalised = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
  return PROTECTED_PATTERNS.some((pattern) => pattern.test(normalised));
}

/** The npm scripts the agent and the verify node may run. Nothing else executes. */
export const ALLOWED_SCRIPTS = ['lint', 'format', 'typecheck', 'test', 'test:report'] as const;
export type AllowedScript = (typeof ALLOWED_SCRIPTS)[number];

export function isAllowedScript(value: string): value is AllowedScript {
  return (ALLOWED_SCRIPTS as readonly string[]).includes(value);
}

/**
 * The environment a child process gets. Nothing else is passed on, so a
 * token in the operator's shell never reaches code the agent wrote.
 *
 * `home` is the HOME the child sees. Anything that executes code from the
 * workspace (test runners, linters, install scripts) gets a scratch
 * directory, because the real home holds SSH keys, npm tokens and shell
 * history. The factory's own git and gh calls keep the real one.
 */
export function childEnvironment(
  source: NodeJS.ProcessEnv = process.env,
  home: string | undefined = source.HOME,
): NodeJS.ProcessEnv {
  const passthrough = ['LANG', 'LC_ALL', 'TMPDIR', 'TERM', 'SHELL'];
  const env: NodeJS.ProcessEnv = { CI: '1', NODE_ENV: 'test', npm_config_update_notifier: 'false' };
  for (const name of passthrough) {
    if (source[name] !== undefined) env[name] = source[name];
  }
  // The directory of the running node goes first on PATH, so `node`, `npm`
  // and `npx` resolve to real binaries. A version-manager shim would look
  // for its configuration under HOME, which the scratch HOME does not have.
  env.PATH = [dirname(process.execPath), source.PATH ?? ''].filter(Boolean).join(delimiter);
  if (home !== undefined) env.HOME = home;
  return env;
}

/**
 * The scratch HOME of a workspace: a sibling tree, never inside the
 * workspace, so nothing a script writes there (npm cache, config) can end
 * up in a diff or a commit. `.factory/workspaces/<id>` gets
 * `.factory/homes/<id>`.
 */
export function scratchHome(workspacePath: string): string {
  return resolve(workspacePath, '..', '..', 'homes', basename(workspacePath));
}
