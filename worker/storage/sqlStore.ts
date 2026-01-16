import type { AssessmentRecord, AssessmentUpsert } from '../../src/shared/assessment';

export interface SqlStore {
  init: () => Promise<void>;
  listAssessments: () => Promise<AssessmentRecord[]>;
  getAssessment: (id: string) => Promise<AssessmentRecord | null>;
  upsertAssessment: (record: AssessmentUpsert) => Promise<AssessmentRecord>;
}
