import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { mkdir, realpath, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createStorageSignedUrl,
  verifyStorageSignedUrl,
} from './signed-url.js';
import type { StorageDriver } from './types.js';

export class LocalStorageDriver implements StorageDriver {
  private readonly root: string;

  constructor(
    storageDir = process.env.STORAGE_DIR ?? path.resolve('.storage'),
  ) {
    this.root = path.resolve(storageDir);
  }

  private async target(key: string, existing: boolean) {
    const root = await realpath(this.root).catch(() => this.root);
    const target = path.resolve(root, key);
    this.assertInside(root, target, key);
    // Check the nearest existing ancestor too, so writes cannot follow a symlink out.
    let ancestor = target;
    while (true) {
      try {
        const actual = await realpath(ancestor);
        this.assertInside(root, actual, key);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        if (existing || ancestor === root) {
          if (existing)
            throw new NotFoundException({
              code: 'NOT_FOUND',
              message: '照片不存在。',
            });
          break;
        }
        ancestor = path.dirname(ancestor);
      }
    }
    return target;
  }

  private assertInside(root: string, target: string, key: string) {
    const relative = path.relative(root, target);
    if (!key || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: '照片路径无效。',
      });
    }
  }

  async put(key: string, buffer: Buffer, _mime: string) {
    void _mime; // Local reads infer MIME from the existing key extension.
    const target = await this.target(key, false);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, buffer);
  }

  async get(key: string) {
    const target = await this.target(key, true);
    if (!(await stat(target)).isFile()) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '照片不存在。',
      });
    }
    const extension = path.extname(target).toLowerCase();
    const mime =
      extension === '.jpg' || extension === '.jpeg'
        ? 'image/jpeg'
        : extension === '.png'
          ? 'image/png'
          : 'application/octet-stream';
    return { stream: createReadStream(target), mime };
  }

  async delete(key: string) {
    const target = await this.target(key, false);
    await unlink(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }

  async signedUrl(key: string, expiresInSeconds: number) {
    await this.target(key, false);
    return createStorageSignedUrl(key, expiresInSeconds);
  }

  async verifySignedUrl(key: string, expires: unknown, signature: unknown) {
    await this.target(key, false);
    verifyStorageSignedUrl(key, expires, signature);
  }
}
