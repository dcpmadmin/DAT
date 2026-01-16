import type { SqlStore } from '../storage/sqlStore';
import type { AssessmentRecord, AssessmentUpsert } from '../../src/shared/assessment';
import Database from 'better-sqlite3';
import { dirname } from 'node:path';
import { promises as fs } from 'node:fs';

const toRecord = (row: any): AssessmentRecord => ({
  id: row.id,
  damageId: row.damage_id,
  approval: row.approval_json ? JSON.parse(row.approval_json) : undefined,
  metrics: row.metrics_json ? JSON.parse(row.metrics_json) : undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export const createSQLiteSqlStore = async (dbPath: string): Promise<SqlStore> => {
  await fs.mkdir(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  const init = async () => {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS assessments (
        id TEXT PRIMARY KEY,
        damage_id TEXT NOT NULL,
        approval_json TEXT,
        metrics_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `).run();
  };

  const listAssessments = async () => {
    const rows = db.prepare('SELECT * FROM assessments ORDER BY updated_at DESC').all();
    return rows.map(toRecord);
  };

  const getAssessment = async (id: string) => {
    const row = db.prepare('SELECT * FROM assessments WHERE id = ?').get(id);
    return row ? toRecord(row) : null;
  };

  const upsertAssessment = async (record: AssessmentUpsert) => {
    const id = record.id || record.damageId;
    const now = new Date().toISOString();
    const existing = db.prepare('SELECT id, created_at FROM assessments WHERE id = ?').get(id) as any;
    const createdAt = existing?.created_at || now;
    db.prepare(`
      INSERT INTO assessments (id, damage_id, approval_json, metrics_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        damage_id = excluded.damage_id,
        approval_json = excluded.approval_json,
        metrics_json = excluded.metrics_json,
        updated_at = excluded.updated_at
    `).run(
      id,
      record.damageId,
      record.approval ? JSON.stringify(record.approval) : null,
      record.metrics ? JSON.stringify(record.metrics) : null,
      createdAt,
      now
    );
    return {
      id,
      damageId: record.damageId,
      approval: record.approval,
      metrics: record.metrics,
      createdAt,
      updatedAt: now
    };
  };

  return { init, listAssessments, getAssessment, upsertAssessment };
};
