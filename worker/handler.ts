import type { ObjectStore } from './storage/objectStore';
import type { SqlStore } from './storage/sqlStore';
import type { AssessmentUpsert } from '../src/shared/assessment';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });

const text = (data: string, status = 200) =>
  new Response(data, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });

export const createHandler = (objectStore: ObjectStore, sqlStore: SqlStore) => {
  const handleRequest = async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return text('', 204);

    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api')) {
      return text('Not Found', 404);
    }

    await sqlStore.init();

    const route = url.pathname.replace('/api', '');

    if (request.method === 'GET' && route === '/health') {
      return json({ ok: true });
    }

    if (request.method === 'POST' && route === '/upload') {
      const formData = await request.formData();
      const file = formData.get('file');
      if (!(file instanceof File)) {
        return json({ error: 'Missing file' }, 400);
      }
      const key = `${crypto.randomUUID()}_${file.name}`;
      const buffer = await file.arrayBuffer();
      const result = await objectStore.putObject(key, buffer, file.type);
      return json(result, 201);
    }

    if (request.method === 'GET' && route === '/assessments') {
      const records = await sqlStore.listAssessments();
      return json(records);
    }

    if (request.method === 'POST' && route === '/assessments') {
      const payload = (await request.json()) as AssessmentUpsert;
      if (!payload?.damageId) {
        return json({ error: 'damageId is required' }, 400);
      }
      const record = await sqlStore.upsertAssessment(payload);
      return json(record, 201);
    }

    const assessmentMatch = route.match(/^\/assessments\/([^/]+)$/);
    if (assessmentMatch) {
      const id = decodeURIComponent(assessmentMatch[1]);
      if (request.method === 'GET') {
        const record = await sqlStore.getAssessment(id);
        if (!record) return json({ error: 'Not found' }, 404);
        return json(record);
      }
      if (request.method === 'PUT') {
        const payload = (await request.json()) as AssessmentUpsert;
        if (!payload?.damageId) {
          return json({ error: 'damageId is required' }, 400);
        }
        const record = await sqlStore.upsertAssessment({ ...payload, id });
        return json(record);
      }
    }

    return text('Not Found', 404);
  };

  return { fetch: handleRequest };
};
