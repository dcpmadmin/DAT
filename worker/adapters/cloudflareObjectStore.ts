import type { ObjectStore } from '../storage/objectStore';

export const createCloudflareObjectStore = (bucket: R2Bucket): ObjectStore => {
  return {
    async putObject(key, data, contentType) {
      await bucket.put(key, data, {
        httpMetadata: contentType ? { contentType } : undefined
      });
      return { key };
    },
    async getObject(key) {
      const obj = await bucket.get(key);
      if (!obj) return null;
      return obj.arrayBuffer();
    }
  };
};
