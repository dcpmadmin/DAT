import type { SqlStore } from '../storage/sqlStore';
import type { AssessmentRecord, AssessmentUpsert } from '../../src/shared/assessment';

const toRecord = (row: any): AssessmentRecord => ({
  id: row.id,
  damageId: row.damage_id,
  approval: row.approval_json ? JSON.parse(row.approval_json) : undefined,
  metrics: row.metrics_json ? JSON.parse(row.metrics_json) : undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export const createCloudflareSqlStore = (db: D1Database): SqlStore => {
  return {
    async init() {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS assessments (
          id TEXT PRIMARY KEY,
          damage_id TEXT NOT NULL,
          approval_json TEXT,
          metrics_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    },
    async listAssessments() {
      const result = await db.prepare('SELECT * FROM assessments ORDER BY updated_at DESC').all();
      return (result.results || []).map(toRecord);
    },
    async getAssessment(id: string) {
      const result = await db.prepare('SELECT * FROM assessments WHERE id = ?').bind(id).first();
      return result ? toRecord(result) : null;
    },
    async upsertAssessment(record: AssessmentUpsert) {
      const id = record.id || record.damageId;
      const now = new Date().toISOString();
      const existing = await db.prepare('SELECT id, created_at FROM assessments WHERE id = ?').bind(id).first();
      const createdAt = existing?.created_at || now;
      await db.prepare(`
        INSERT INTO assessments (id, damage_id, approval_json, metrics_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          damage_id = excluded.damage_id,
          approval_json = excluded.approval_json,
          metrics_json = excluded.metrics_json,
          updated_at = excluded.updated_at
      `)
        .bind(
          id,
          record.damageId,
          record.approval ? JSON.stringify(record.approval) : null,
          record.metrics ? JSON.stringify(record.metrics) : null,
          createdAt,
          now
        )
        .run();
      return {
        id,
        damageId: record.damageId,
        approval: record.approval,
        metrics: record.metrics,
        createdAt,
        updatedAt: now
      };
    }
  };
};
