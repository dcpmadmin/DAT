export interface SerializedApproval {
  status: 'pending' | 'approved' | 'query' | 'rejected';
  comments: string;
  timestamp: string;
  severity?: 'minor' | 'moderate' | 'major' | 'critical';
  priority?: 'low' | 'medium' | 'high';
  confidence?: 'low' | 'medium' | 'high';
  followUp?: string;
  notes?: string;
  estimateDays?: number;
  costRangeAud?: string;
}

export interface AssessmentMetrics {
  distanceMeters?: number;
  costAUD?: number;
}

export interface AssessmentRecord {
  id: string;
  damageId: string;
  approval?: SerializedApproval;
  metrics?: AssessmentMetrics;
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentUpsert {
  id?: string;
  damageId: string;
  approval?: SerializedApproval;
  metrics?: AssessmentMetrics;
}
