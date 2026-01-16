import type { ObjectStore } from '../storage/objectStore';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

export const createLocalObjectStore = (baseDir: string): ObjectStore => {
  const ensureDir = async () => {
    await fs.mkdir(baseDir, { recursive: true });
  };

  return {
    async putObject(key, data) {
      await ensureDir();
      const filePath = join(baseDir, key);
      await fs.writeFile(filePath, Buffer.from(data));
      return { key };
    },
    async getObject(key) {
      try {
        const filePath = join(baseDir, key);
        return await fs.readFile(filePath);
      } catch {
        return null;
      }
    }
  };
};
