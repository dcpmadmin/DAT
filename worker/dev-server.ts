import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { createHandler } from './handler';
import { createLocalObjectStore } from './adapters/localObjectStore';
import { createSQLiteSqlStore } from './adapters/sqliteSqlStore';

const PORT = 8787;
const OBJECTS_DIR = 'local_storage/objects';
const DB_PATH = 'local_storage/db.sqlite';

const start = async () => {
  const objectStore = createLocalObjectStore(OBJECTS_DIR);
  const sqlStore = await createSQLiteSqlStore(DB_PATH);
  const handler = createHandler(objectStore, sqlStore);

  const server = createServer(async (req, res) => {
    try {
      const url = `http://${req.headers.host}${req.url}`;
      const body = req.method === 'GET' || req.method === 'HEAD'
        ? undefined
        : Readable.toWeb(req);
      const request = new Request(url, {
        method: req.method,
        headers: req.headers as any,
        body
      });
      const response = await handler.fetch(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      const buffer = Buffer.from(await response.arrayBuffer());
      res.end(buffer);
    } catch (error) {
      console.error('API error:', error);
      res.statusCode = 500;
      res.end('Server error');
    }
  });

  server.listen(PORT, () => {
    console.log(`Local API listening on http://localhost:${PORT}`);
  });
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
