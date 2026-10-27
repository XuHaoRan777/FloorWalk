export type Role = 'inspector' | 'supervisor' | 'hq';

export type User = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  siteId: string | null;
  createdAt: string;
};

export type Session = { user: User };

export type InspectionItem = {
  id: string;
  inspectionId: string;
  position: number;
  title: string;
  photoRequired: boolean;
  critical: boolean;
  result: 'pending' | 'pass' | 'fail';
  note: string | null;
  createdAt: string;
  evidence: Evidence[];
};

export type Evidence = {
  id: string;
  inspectionItemId: string;
  storageKey: string;
  mime: string;
  size: number;
  createdAt: string;
};

export type Review = {
  id: string;
  inspectionId: string;
  reviewerId: string;
  action: 'start' | 'approve' | 'rework' | 'fail';
  comment: string | null;
  reworkItemIds: string[] | null;
  createdAt: string;
};

export type InspectionDetail = {
  id: string;
  siteId: string;
  templateId: string;
  inspectorId: string;
  status: 'draft' | 'submitted' | 'in_review' | 'passed' | 'rework' | 'failed';
  score: number | null;
  submittedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  site: { id: string; code: string; name: string; createdAt: string };
  items: InspectionItem[];
  reviews: Review[];
};

export type DashboardSite = {
  site: { id: string; code: string; name: string; createdAt: string };
  latestScore: number | null;
  latestStatus: InspectionDetail['status'] | null;
};
