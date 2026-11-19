import { mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const attemptDirectory = fileURLToPath(
  new URL('../../../../.run/', import.meta.url),
);

type EmailAttemptFileSystem = Pick<
  typeof import('node:fs/promises'),
  'mkdir' | 'open'
>;

export async function reserveEmailAttempt(
  fileSystem: EmailAttemptFileSystem = { mkdir, open },
) {
  await fileSystem.mkdir(attemptDirectory, { recursive: true });
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const handle = await fileSystem.open(
        join(attemptDirectory, `fw039-email-attempt-${attempt}`),
        'wx',
      );
      await handle.close();
      return attempt;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  return null;
}
