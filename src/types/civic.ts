import type { Timestamp } from 'firebase/firestore';

export const COMPLAINT_CATEGORIES = [
  'Water & Drainage',
  'Traffic & Signals',
  'Roadways & Potholes',
  'Street Lighting',
  'Sanitation & Waste',
  'Public Parks & Trees',
] as const;

export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];

export const AFFECTED_SCOPES = [
  'Isolated Spot',
  'Block Level',
  'Neighborhood',
  'Major Corridor',
] as const;

export type AffectedScope = (typeof AFFECTED_SCOPES)[number];

export const PRIORITY_TIERS = [
  'P1 Critical',
  'P2 High',
  'P3 Moderate',
  'P4 Routine',
] as const;

export type PriorityTier = (typeof PRIORITY_TIERS)[number];

export const COMPLAINT_STATUSES = [
  'Submitted',
  'Triaged',
  'Dispatched',
  'In Progress',
  'Resolved',
  'Closed',
] as const;

export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const DEPARTMENTS = [
  'Unassigned',
  'Water & Sewer Ops',
  'Traffic Engineering',
  'Public Works',
  'Electrical Grid',
  'Sanitation Dept',
  'Urban Forestry',
] as const;

export type Department = (typeof DEPARTMENTS)[number];

export const WARDS = [
  'Ward 01 · Downtown Core',
  'Ward 02 · Riverfront',
  'Ward 03 · Northgate',
  'Ward 04 · Oakridge',
  'Ward 05 · Eastside Industrial',
  'Ward 06 · Westview Heights',
] as const;

export interface Complaint {
  id: string;
  trackingCode: string;
  title: string;
  description: string;
  category: ComplaintCategory;
  ward: string;
  locationLabel: string;
  lat?: number;
  lng?: number;
  severity: number; // 1-5
  safetyImpact: number; // 1-5
  affectedScope: AffectedScope;
  corroborationCount: number;
  priorityScore: number; // 0-100
  priorityTier: PriorityTier;
  status: ComplaintStatus;
  assignedDepartment: string;
  assignedCrew: string;
  slaTargetHours: number;
  evidenceImageUrl?: string;
  isPublic: boolean;
  reporterId: string;
  reporterName: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  resolvedAt?: Timestamp | null;
}

export interface Corroboration {
  id: string;
  userId: string;
  complaintId: string;
  note?: string;
  createdAt: Timestamp | null;
}

export type UpdateActionType =
  | 'Filed'
  | 'Triaged'
  | 'Dispatched'
  | 'Status Change'
  | 'Field Note'
  | 'Resolved'
  | 'Closed';

export interface ResolutionUpdate {
  id: string;
  complaintId: string;
  authorId: string;
  authorName: string;
  authorRole: 'Citizen' | 'Dispatcher' | 'Field Lead';
  actionType: UpdateActionType;
  fromStatus: string;
  toStatus: string;
  note: string;
  isPublic: boolean;
  createdAt: Timestamp | null;
}

export type WorkspaceView = 'queue' | 'map' | 'tracker' | 'matrix' | 'submissions';
