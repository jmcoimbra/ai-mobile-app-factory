import { mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { isProtectedPath } from '../policy.ts';

export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxError';
  }
}

const MAX_FILE_BYTES = 512 * 1024;
const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.expo',
  'android',
  'ios',
  'coverage',
  'dist',
]);

/**
 * File access confined to one directory. Every path the agent gives is
 * resolved against the root and checked after symlinks are followed, so
 * neither `../` nor a link pointing outside gets through. Protected paths
 * are read-only.
 */
export class Sandbox {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  /** The absolute path of a relative path inside the root, or a SandboxError. */
  async resolveInside(relativePath: string, { forWrite = false } = {}): Promise<string> {
    if (typeof relativePath !== 'string' || relativePath.length === 0) {
      throw new SandboxError('a path is required');
    }
    if (isAbsolute(relativePath) || relativePath.includes('\0')) {
      throw new SandboxError(`"${relativePath}" is not a relative path inside the workspace`);
    }
    const absolute = resolve(this.root, relativePath);
    const relativeToRoot = relative(this.root, absolute);
    if (relativeToRoot.startsWith('..') || isAbsolute(relativeToRoot)) {
      throw new SandboxError(`"${relativePath}" leaves the workspace`);
    }
    if (forWrite && isProtectedPath(relativeToRoot)) {
      throw new SandboxError(`"${relativeToRoot}" is protected. A person has to change it.`);
    }

    // Follow symlinks on the deepest existing ancestor; a link out of the
    // root would otherwise pass the string check above.
    let existing = absolute;
    while (true) {
      try {
        await stat(existing);
        break;
      } catch {
        const parent = dirname(existing);
        if (parent === existing) break;
        existing = parent;
      }
    }
    const real = await realpath(existing);
    const rootReal = await realpath(this.root);
    if (real !== rootReal && !real.startsWith(rootReal + sep)) {
      throw new SandboxError(`"${relativePath}" resolves outside the workspace`);
    }
    return absolute;
  }

  async read(relativePath: string): Promise<string> {
    const absolute = await this.resolveInside(relativePath);
    const info = await stat(absolute);
    if (info.size > MAX_FILE_BYTES)
      throw new SandboxError(`"${relativePath}" is too large to read`);
    return readFile(absolute, 'utf8');
  }

  async write(relativePath: string, content: string): Promise<void> {
    const absolute = await this.resolveInside(relativePath, { forWrite: true });
    if (Buffer.byteLength(content) > MAX_FILE_BYTES) {
      throw new SandboxError(`"${relativePath}" is too large to write`);
    }
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content, 'utf8');
  }

  /** Relative paths of the files under a directory, skipping generated trees. */
  async list(relativePath = '.'): Promise<string[]> {
    const absolute = await this.resolveInside(relativePath);
    const found: string[] = [];
    const walk = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue;
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) await walk(path);
        else found.push(relative(this.root, path));
      }
    };
    await walk(absolute);
    return found.sort();
  }
}
