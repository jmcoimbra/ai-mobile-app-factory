import { execFile } from 'node:child_process';

import { childEnvironment, isAllowedScript, type AllowedScript } from '../policy.ts';

export class CommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandError';
  }
}

export interface CommandResult {
  ok: boolean;
  exitCode: number;
  output: string;
}

const MAX_OUTPUT = 64 * 1024;

/**
 * Runs npm scripts from the allowlist, and nothing else. No shell is
 * involved, the script name is the only variable part, and the child gets
 * a minimal environment with no secret in it.
 */
export function createCommandRunner(cwd: string, timeoutMs = 15 * 60 * 1000) {
  return {
    async run(script: string, args: readonly string[] = []): Promise<CommandResult> {
      if (!isAllowedScript(script)) {
        throw new CommandError(`"${script}" is not an allowed script`);
      }
      for (const argument of args) {
        if (!/^[\w./@:=-]+$/.test(argument)) {
          throw new CommandError(`argument "${argument}" is not allowed`);
        }
      }
      return new Promise((resolvePromise) => {
        execFile(
          'npm',
          ['run', script as AllowedScript, '--', ...args],
          { cwd, env: childEnvironment(), timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 },
          (error, stdout, stderr) => {
            const output = `${stdout}\n${stderr}`.slice(-MAX_OUTPUT);
            const exitCode =
              error && 'code' in error && typeof error.code === 'number'
                ? error.code
                : error
                  ? 1
                  : 0;
            resolvePromise({ ok: !error, exitCode, output });
          },
        );
      });
    },
  };
}

export type CommandRunner = ReturnType<typeof createCommandRunner>;
