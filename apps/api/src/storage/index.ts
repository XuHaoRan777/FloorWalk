import { LocalStorageDriver } from './local.js';
import type { StorageDriver } from './types.js';

export type { StorageDriver } from './types.js';
export { LocalStorageDriver } from './local.js';

export async function getStorageDriver(
  localStoragePath?: string,
): Promise<StorageDriver> {
  const driver = process.env.STORAGE_DRIVER ?? 'local';
  if (driver === 'local') return new LocalStorageDriver(localStoragePath);
  if (driver === 'oss') {
    const modulePath = './oss.js';
    const module = await import(modulePath).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ERR_MODULE_NOT_FOUND')
          throw new Error('OSS 存储驱动未实现。');
        throw error;
      },
    );
    return new module.OssStorageDriver();
  }
  throw new Error(`未知存储驱动：${driver}`);
}
