import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Loads the repository's `.env` in development.
 *
 * Deployed environments inject real environment variables and have no `.env`
 * file, so this is a no-op there. Nothing is overwritten that the platform has
 * already set — a secret from the hosting provider always wins over a stale
 * line in a local file.
 */
export function loadEnvFile(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));

  // Walk up from wherever the bundle ended up: src/, dist/, or a build output.
  for (let dir = here, i = 0; i < 6; i += 1, dir = resolve(dir, '..')) {
    const candidate = join(dir, '.env');
    if (!existsSync(candidate)) continue;

    const before = new Set(Object.keys(process.env));
    process.loadEnvFile(candidate);

    // Restore anything the file shadowed that was already set by the platform.
    for (const key of before) {
      const original = originalValues.get(key);
      if (original !== undefined) process.env[key] = original;
    }
    return candidate;
  }

  return null;
}

/** Snapshot taken at import time, before any file can overwrite it. */
const originalValues = new Map(
  Object.entries(process.env).filter(([, v]) => v !== undefined) as [string, string][],
);
