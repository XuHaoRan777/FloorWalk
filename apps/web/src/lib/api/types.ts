import type { InspectionDetail as SharedInspectionDetail } from '@libs/shared';

export type Role = 'store_manager' | 'admin';

export type User = {
  id: string;
  loginName: string;
  displayName: string;
  role: Role;
  siteId: string | null;
  org: { id: string; name: string };
  mustChangePassword: boolean;
  createdAt: string;
};

export type Session = { user: User };

export type InspectionDetail = SharedInspectionDetail;
export type InspectionItem = InspectionDetail['items'][number];
export type Evidence = InspectionItem['evidence'][number];
export type Review = InspectionDetail['reviews'][number];

export type DashboardSite = {
  site: { id: string; code: string; name: string; createdAt: string };
  latestScore: number | null;
  latestStatus: InspectionDetail['status'] | null;
};
