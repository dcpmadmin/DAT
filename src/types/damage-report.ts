export interface PhotoLocation {
  latitude: number;
  longitude: number;
}

export interface PhotoMetadata {
  file?: File;
  name: string;
  url: string;
  location?: PhotoLocation;
  orientation?: number;
  timestamp?: Date;
}

export interface PhotoSet {
  damageId: string;
  damagePhotos: PhotoMetadata[];
  preconditionPhotos: PhotoMetadata[];
  completionPhotos: PhotoMetadata[];
  referenceLocation?: PhotoLocation;
  damageDetails?: DamageDetails;
}

export interface SelectedPhotos {
  precondition?: PhotoMetadata;
  damage?: PhotoMetadata;
  completion?: PhotoMetadata;
}

export interface GalleryState {
  visible: boolean;
  selectedPhoto?: PhotoMetadata;
  candidatePhotos: PhotoMetadata[];
  rotation: number;
  zoom: number;
  panX: number;
  panY: number;
}

export interface PhotoSetApproval {
  status: 'pending' | 'approved' | 'query' | 'rejected';
  comments: string;
  timestamp: Date;
  severity?: 'minor' | 'moderate' | 'major' | 'critical';
  priority?: 'low' | 'medium' | 'high';
  confidence?: 'low' | 'medium' | 'high';
  followUp?: string;
  notes?: string;
  estimateDays?: number;
  costRangeAud?: string;
}

export interface DamageDetails {
  damageType?: string;
  treatment?: string;
  dimensions?: string;
  costAUD?: number;
}

export interface DamageReportState {
  photoSets: PhotoSet[];
  currentSetIndex: number;
  selectedPhotos: SelectedPhotos;
  galleries: {
    precondition: GalleryState;
    damage: GalleryState;
    completion: GalleryState;
  };
  searchTerm: string;
  mapVisible: boolean;
  approvals: Record<string, PhotoSetApproval>;
}

export type PhotoType = 'precondition' | 'damage' | 'completion';
export type GalleryType = PhotoType;
