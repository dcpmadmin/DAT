import { createHandler } from './handler';
import { createCloudflareObjectStore } from './adapters/cloudflareObjectStore';
import { createCloudflareSqlStore } from './adapters/cloudflareSqlStore';

export interface Env {
  OBJECT_STORE: R2Bucket;
  DB: D1Database;
}

export default {
  fetch(request: Request, env: Env) {
    const objectStore = createCloudflareObjectStore(env.OBJECT_STORE);
    const sqlStore = createCloudflareSqlStore(env.DB);
    return createHandler(objectStore, sqlStore).fetch(request);
  }
};
