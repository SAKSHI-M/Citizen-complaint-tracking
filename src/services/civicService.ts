import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import type {
  AffectedScope,
  Complaint,
  ComplaintCategory,
  ComplaintStatus,
  UpdateActionType,
} from '../types/civic';
import {
  calculatePriority,
  generateTrackingCode,
  getSuggestedDepartment,
  SAMPLE_EVIDENCE_IMAGES,
} from '../utils/priorityEngine';

function createCleanId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

function clampText(value: string, maxLen: number): string {
  return value.trim().slice(0, maxLen);
}

export async function checkUserIsAdmin(user: User): Promise<boolean> {
  if (!user.emailVerified) return false;
  if (user.email === BOOTSTRAPPED_ADMIN_EMAIL) return true;

  const adminPath = `admins/${user.uid}`;
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists();
  } catch (error) {
    // Non-admins may get permission-denied on non-existent doc or if rules block; fail closed safely
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Missing or insufficient permissions')) {
      return false;
    }
    handleFirestoreError(error, OperationType.GET, adminPath);
  }
}

export async function syncPrivateUserProfile(user: User, wardPreference?: string): Promise<void> {
  if (!user.emailVerified) return;
  const path = `users/${user.uid}/private/profile`;
  try {
    const payload: Record<string, unknown> = {
      uid: user.uid,
      displayName: clampText(user.displayName || 'Verified Citizen', 80),
      email: clampText(user.email || 'citizen@civictrack.local', 140),
      updatedAt: serverTimestamp(),
    };
    if (wardPreference && wardPreference.trim()) {
      payload.wardPreference = clampText(wardPreference, 80);
    }
    await setDoc(doc(db, 'users', user.uid, 'private', 'profile'), payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export interface CreateComplaintInput {
  title: string;
  description: string;
  category: ComplaintCategory;
  ward: string;
  locationLabel: string;
  lat?: number;
  lng?: number;
  severity: number;
  safetyImpact: number;
  affectedScope: AffectedScope;
  evidenceImageUrl?: string;
}

function isValidCoord(lat?: number, lng?: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export async function createComplaint(user: User, input: CreateComplaintInput): Promise<string> {
  const complaintId = createCleanId('cmp');
  const updateId = createCleanId('upd');
  const trackingCode = generateTrackingCode();
  const breakdown = calculatePriority(
    input.severity,
    input.safetyImpact,
    input.affectedScope,
    0
  );

  const complaintRef = doc(db, 'complaints', complaintId);
  const updateRef = doc(db, 'complaints', complaintId, 'updates', updateId);

  const batch = writeBatch(db);

  const complaintPayload: Record<string, unknown> = {
    trackingCode,
    title: clampText(input.title, 140),
    description: clampText(input.description, 2000),
    category: input.category,
    ward: clampText(input.ward, 80),
    locationLabel: clampText(input.locationLabel, 140),
    severity: Math.min(5, Math.max(1, Math.round(input.severity))),
    safetyImpact: Math.min(5, Math.max(1, Math.round(input.safetyImpact))),
    affectedScope: input.affectedScope,
    corroborationCount: 0,
    priorityScore: breakdown.totalScore,
    priorityTier: breakdown.tier,
    status: 'Submitted',
    assignedDepartment: 'Unassigned',
    assignedCrew: 'Pending Dispatch',
    slaTargetHours: breakdown.slaTargetHours,
    isPublic: true,
    reporterId: user.uid,
    reporterName: clampText(user.displayName || 'Verified Citizen', 80),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (input.evidenceImageUrl && input.evidenceImageUrl.trim()) {
    complaintPayload.evidenceImageUrl = clampText(input.evidenceImageUrl, 300);
  }
  if (isValidCoord(input.lat, input.lng)) {
    complaintPayload.lat = Number(input.lat!.toFixed(6));
    complaintPayload.lng = Number(input.lng!.toFixed(6));
  }

  batch.set(complaintRef, complaintPayload);

  batch.set(updateRef, {
    complaintId,
    authorId: user.uid,
    authorName: clampText(user.displayName || 'Verified Citizen', 80),
    authorRole: 'Citizen',
    actionType: 'Filed',
    fromStatus: 'New',
    toStatus: 'Submitted',
    note: clampText(
      `Complaint filed for ${input.locationLabel} (${input.ward}). Initial calculated priority ${breakdown.totalScore}/100 (${breakdown.tier}).`,
      600
    ),
    isPublic: true,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return complaintId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `complaints/${complaintId}`);
  }
}

export async function updateOwnSubmittedComplaint(
  complaint: Complaint,
  input: Omit<CreateComplaintInput, 'evidenceImageUrl'>
): Promise<void> {
  const breakdown = calculatePriority(
    input.severity,
    input.safetyImpact,
    input.affectedScope,
    complaint.corroborationCount
  );

  const complaintRef = doc(db, 'complaints', complaint.id);
  const path = `complaints/${complaint.id}`;

  try {
    const batch = writeBatch(db);
    const updatePayload: Record<string, unknown> = {
      title: clampText(input.title, 140),
      description: clampText(input.description, 2000),
      category: input.category,
      ward: clampText(input.ward, 80),
      locationLabel: clampText(input.locationLabel, 140),
      severity: Math.min(5, Math.max(1, Math.round(input.severity))),
      safetyImpact: Math.min(5, Math.max(1, Math.round(input.safetyImpact))),
      affectedScope: input.affectedScope,
      priorityScore: breakdown.totalScore,
      priorityTier: breakdown.tier,
      slaTargetHours: breakdown.slaTargetHours,
      updatedAt: serverTimestamp(),
    };
    if (isValidCoord(input.lat, input.lng)) {
      updatePayload.lat = Number(input.lat!.toFixed(6));
      updatePayload.lng = Number(input.lng!.toFixed(6));
    }
    batch.update(complaintRef, updatePayload);
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateComplaintCoordinates(
  complaint: Complaint,
  lat: number,
  lng: number,
  locationLabel?: string
): Promise<void> {
  if (!isValidCoord(lat, lng)) return;
  const complaintRef = doc(db, 'complaints', complaint.id);
  const path = `complaints/${complaint.id}`;
  try {
    const batch = writeBatch(db);
    const payload: Record<string, unknown> = {
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      updatedAt: serverTimestamp(),
    };
    if (locationLabel && locationLabel.trim().length >= 3) {
      payload.locationLabel = clampText(locationLabel, 140);
    }
    batch.update(complaintRef, payload);
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function corroborateComplaint(
  user: User,
  complaint: Complaint,
  note?: string
): Promise<void> {
  const nextCount = complaint.corroborationCount + 1;
  const breakdown = calculatePriority(
    complaint.severity,
    complaint.safetyImpact,
    complaint.affectedScope,
    nextCount
  );

  const complaintRef = doc(db, 'complaints', complaint.id);
  const corrobRef = doc(db, 'complaints', complaint.id, 'corroborations', user.uid);
  const batch = writeBatch(db);

  const corrobPayload: Record<string, unknown> = {
    userId: user.uid,
    complaintId: complaint.id,
    createdAt: serverTimestamp(),
  };
  if (note && note.trim().length > 0) {
    corrobPayload.note = clampText(note, 240);
  }

  batch.set(corrobRef, corrobPayload);
  batch.update(complaintRef, {
    corroborationCount: nextCount,
    priorityScore: breakdown.totalScore,
    priorityTier: breakdown.tier,
    updatedAt: serverTimestamp(),
  });

  if (note && note.trim().length >= 2) {
    const updateId = createCleanId('upd');
    const updateRef = doc(db, 'complaints', complaint.id, 'updates', updateId);
    batch.set(updateRef, {
      complaintId: complaint.id,
      authorId: user.uid,
      authorName: clampText(user.displayName || 'Verified Citizen', 80),
      authorRole: 'Citizen',
      actionType: 'Field Note',
      fromStatus: complaint.status,
      toStatus: complaint.status,
      note: clampText(`Corroboration note: ${note.trim()}`, 600),
      isPublic: complaint.isPublic,
      createdAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `complaints/${complaint.id}/corroborations/${user.uid}`
    );
  }
}

export interface DispatcherUpdateInput {
  severity: number;
  safetyImpact: number;
  affectedScope: AffectedScope;
  status: ComplaintStatus;
  assignedDepartment: string;
  assignedCrew: string;
  note: string;
}

export async function dispatchAndUpdateComplaint(
  user: User,
  complaint: Complaint,
  input: DispatcherUpdateInput
): Promise<void> {
  const breakdown = calculatePriority(
    input.severity,
    input.safetyImpact,
    input.affectedScope,
    complaint.corroborationCount
  );

  const complaintRef = doc(db, 'complaints', complaint.id);
  const updateId = createCleanId('upd');
  const updateRef = doc(db, 'complaints', complaint.id, 'updates', updateId);
  const batch = writeBatch(db);

  const isTerminal = input.status === 'Resolved' || input.status === 'Closed';
  const wasTerminal = complaint.status === 'Resolved' || complaint.status === 'Closed';

  let actionType: UpdateActionType = 'Status Change';
  if (input.status === 'Triaged' && complaint.status === 'Submitted') actionType = 'Triaged';
  else if (input.status === 'Dispatched') actionType = 'Dispatched';
  else if (input.status === 'Resolved') actionType = 'Resolved';
  else if (input.status === 'Closed') actionType = 'Closed';

  const updateFields: Record<string, unknown> = {
    severity: Math.min(5, Math.max(1, Math.round(input.severity))),
    safetyImpact: Math.min(5, Math.max(1, Math.round(input.safetyImpact))),
    affectedScope: input.affectedScope,
    priorityScore: breakdown.totalScore,
    priorityTier: breakdown.tier,
    status: input.status,
    assignedDepartment: clampText(input.assignedDepartment || 'Unassigned', 80),
    assignedCrew: clampText(input.assignedCrew || 'Pending Dispatch', 80),
    slaTargetHours: breakdown.slaTargetHours,
    updatedAt: serverTimestamp(),
  };

  if (isTerminal && !wasTerminal) {
    updateFields.resolvedAt = serverTimestamp();
  } else if (!isTerminal && wasTerminal) {
    updateFields.resolvedAt = null;
  }

  batch.update(complaintRef, updateFields);

  batch.set(updateRef, {
    complaintId: complaint.id,
    authorId: user.uid,
    authorName: clampText(user.displayName || 'Municipal Dispatcher', 80),
    authorRole: 'Dispatcher',
    actionType,
    fromStatus: complaint.status,
    toStatus: input.status,
    note: clampText(input.note, 600),
    isPublic: complaint.isPublic,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `complaints/${complaint.id}`);
  }
}

export async function addResolutionNote(
  user: User,
  complaint: Complaint,
  note: string,
  isAdmin: boolean
): Promise<void> {
  const updateId = createCleanId('upd');
  const updateRef = doc(db, 'complaints', complaint.id, 'updates', updateId);
  const path = `complaints/${complaint.id}/updates/${updateId}`;

  try {
    await setDoc(updateRef, {
      complaintId: complaint.id,
      authorId: user.uid,
      authorName: clampText(user.displayName || 'Verified Citizen', 80),
      authorRole: isAdmin ? 'Dispatcher' : 'Citizen',
      actionType: 'Field Note',
      fromStatus: complaint.status,
      toStatus: complaint.status,
      note: clampText(note, 600),
      isPublic: complaint.isPublic,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function seedSampleCivicCases(user: User, isAdmin: boolean): Promise<void> {
  const samples: Array<{
    trackingCode: string;
    title: string;
    description: string;
    category: ComplaintCategory;
    ward: string;
    locationLabel: string;
    severity: number;
    safetyImpact: number;
    affectedScope: AffectedScope;
    corroborationCount: number;
    status: ComplaintStatus;
    assignedDepartment: string;
    assignedCrew: string;
    evidenceImageUrl?: string;
    logNote: string;
  }> = [
    {
      trackingCode: 'CT-4108A',
      title: 'Pressurized water main rupture flooding Elm St curb lane',
      description:
        'Steady pressurized water emerging through fractured asphalt adjacent to the water valve box. Water is pooling across the eastbound cycling lane and approaching the pedestrian crosswalk.',
      category: 'Water & Drainage',
      ward: 'Ward 04 · Oakridge',
      locationLabel: 'Elm St & 14th Ave Intersection',
      severity: 5,
      safetyImpact: 5,
      affectedScope: 'Major Corridor',
      corroborationCount: 19,
      status: 'In Progress',
      assignedDepartment: 'Water & Sewer Ops',
      assignedCrew: 'Hydrant & Main Unit 3',
      evidenceImageUrl: SAMPLE_EVIDENCE_IMAGES.waterMain,
      logNote: 'Safety cones placed; excavation crew isolating 12-inch distribution valve.',
    },
    {
      trackingCode: 'CT-4112B',
      title: 'Northbound intersection traffic signal dark during evening peak',
      description:
        'Primary traffic signal heads at the four-way junction lost illumination at 17:40. Pedestrian walk countdown remains active on one corner while vehicle signals are completely unlit.',
      category: 'Traffic & Signals',
      ward: 'Ward 01 · Downtown Core',
      locationLabel: 'Market St & 5th Ave Crossing',
      severity: 5,
      safetyImpact: 5,
      affectedScope: 'Major Corridor',
      corroborationCount: 14,
      status: 'Dispatched',
      assignedDepartment: 'Traffic Engineering',
      assignedCrew: 'Signal Response Van 2',
      evidenceImageUrl: SAMPLE_EVIDENCE_IMAGES.trafficSignal,
      logNote: 'Dispatched signal cabinet technician with portable generator backup.',
    },
    {
      trackingCode: 'CT-4119C',
      title: 'Blocked storm drain catch basin causing sidewalk ponding',
      description:
        'Storm grate is packed with compacted leaves, gravel, and branches following overnight rainfall. Standing water extends 6 feet into the travel lane near bus stop #114.',
      category: 'Water & Drainage',
      ward: 'Ward 02 · Riverfront',
      locationLabel: 'Riverside Dr near 8th St Bus Bay',
      severity: 3,
      safetyImpact: 3,
      affectedScope: 'Block Level',
      corroborationCount: 6,
      status: 'Triaged',
      assignedDepartment: 'Water & Sewer Ops',
      assignedCrew: 'Vactor Crew B',
      evidenceImageUrl: SAMPLE_EVIDENCE_IMAGES.stormDrain,
      logNote: 'Verified drainage obstruction; scheduled vacuum truck clearing on morning route.',
    },
    {
      trackingCode: 'CT-4124D',
      title: 'Deep axle-hazard pothole in westbound transit lane',
      description:
        'Asphalt delamination roughly 28 inches wide and 5 inches deep right along the wheel track approaching the bridge ramp. Multiple commuter buses swerving to avoid.',
      category: 'Roadways & Potholes',
      ward: 'Ward 05 · Eastside Industrial',
      locationLabel: 'Foundry Blvd Westbound Ramp',
      severity: 4,
      safetyImpact: 4,
      affectedScope: 'Major Corridor',
      corroborationCount: 9,
      status: 'Submitted',
      assignedDepartment: 'Unassigned',
      assignedCrew: 'Pending Dispatch',
      logNote: 'Citizen complaint filed with corridor hazard details.',
    },
    {
      trackingCode: 'CT-4095E',
      title: 'Three consecutive LED streetlamps out along school walkway',
      description:
        'Overhead cobra-head luminaires along the north side of Oakridge Elementary crosswalks remain dark after dusk, reducing visibility for evening pedestrians.',
      category: 'Street Lighting',
      ward: 'Ward 04 · Oakridge',
      locationLabel: 'Cedar Ave between 10th & 12th',
      severity: 3,
      safetyImpact: 4,
      affectedScope: 'Neighborhood',
      corroborationCount: 11,
      status: 'Resolved',
      assignedDepartment: 'Electrical Grid',
      assignedCrew: 'Bucket Truck E-4',
      logNote: 'Replaced failed photocell relay in pole #408 and verified full circuit illumination.',
    },
    {
      trackingCode: 'CT-4131F',
      title: 'Overflowing municipal recycling bank after weekend collection miss',
      description:
        'Three public collection bins adjacent to the community plaza are at capacity with bagged overflow stacked beside the enclosure.',
      category: 'Sanitation & Waste',
      ward: 'Ward 03 · Northgate',
      locationLabel: 'Northgate Plaza South Entrance',
      severity: 2,
      safetyImpact: 1,
      affectedScope: 'Block Level',
      corroborationCount: 2,
      status: 'Submitted',
      assignedDepartment: 'Unassigned',
      assignedCrew: 'Pending Dispatch',
      logNote: 'Complaint registered in Ward 03 sanitation queue.',
    },
  ];

  const batch = writeBatch(db);

  for (const item of samples) {
    const complaintId = createCleanId('cmp');
    const updateId = createCleanId('upd');
    const corrobCount = isAdmin ? item.corroborationCount : 0;
    const status: ComplaintStatus = isAdmin ? item.status : 'Submitted';
    const assignedDepartment = isAdmin
      ? item.assignedDepartment
      : 'Unassigned';
    const assignedCrew = isAdmin ? item.assignedCrew : 'Pending Dispatch';

    const breakdown = calculatePriority(
      item.severity,
      item.safetyImpact,
      item.affectedScope,
      corrobCount
    );

    const payload: Record<string, unknown> = {
      trackingCode: item.trackingCode,
      title: item.title,
      description: item.description,
      category: item.category,
      ward: item.ward,
      locationLabel: item.locationLabel,
      severity: item.severity,
      safetyImpact: item.safetyImpact,
      affectedScope: item.affectedScope,
      corroborationCount: corrobCount,
      priorityScore: breakdown.totalScore,
      priorityTier: breakdown.tier,
      status,
      assignedDepartment:
        status === 'Submitted' && !isAdmin
          ? 'Unassigned'
          : assignedDepartment || getSuggestedDepartment(item.category),
      assignedCrew,
      slaTargetHours: breakdown.slaTargetHours,
      isPublic: true,
      reporterId: user.uid,
      reporterName: clampText(user.displayName || 'Civic Reporter', 80),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (item.evidenceImageUrl) {
      payload.evidenceImageUrl = item.evidenceImageUrl;
    }
    if (status === 'Resolved' || status === 'Closed') {
      payload.resolvedAt = serverTimestamp();
    }

    batch.set(doc(db, 'complaints', complaintId), payload);

    batch.set(doc(db, 'complaints', complaintId, 'updates', updateId), {
      complaintId,
      authorId: user.uid,
      authorName: clampText(user.displayName || 'Civic Reporter', 80),
      authorRole: isAdmin && status !== 'Submitted' ? 'Dispatcher' : 'Citizen',
      actionType:
        !isAdmin || status === 'Submitted'
          ? 'Filed'
          : status === 'Resolved'
            ? 'Resolved'
            : status === 'Dispatched'
              ? 'Dispatched'
              : 'Triaged',
      fromStatus: status === 'Submitted' ? 'New' : 'Submitted',
      toStatus: status,
      note: isAdmin
        ? item.logNote
        : `Filed civic report for ${item.locationLabel}. Initial priority score ${breakdown.totalScore}/100.`,
      isPublic: true,
      createdAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'complaints');
  }
}
