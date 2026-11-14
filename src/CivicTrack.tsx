import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import {
  ArrowUpRight,
  Download,
  FileText,
  Layers,
  ListFilter,
  LogOut,
  MapPin,
  Menu,
  Plus,
  Search,
  SlidersHorizontal,
  UserCheck,
  X,
} from 'lucide-react';
import { CaseDetailDrawer } from './components/CaseDetailDrawer';
import { ComplaintMapView } from './components/ComplaintMapView';
import { ComplaintModal } from './components/ComplaintModal';
import { PriorityMatrixView } from './components/PriorityMatrixView';
import { ResolutionTrackerView } from './components/ResolutionTrackerView';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import {
  checkUserIsAdmin,
  corroborateComplaint,
  createComplaint,
  seedSampleCivicCases,
  syncPrivateUserProfile,
  updateOwnSubmittedComplaint,
} from './services/civicService';
import {
  COMPLAINT_CATEGORIES,
  PRIORITY_TIERS,
  type AffectedScope,
  type Complaint,
  type ComplaintCategory,
  type WorkspaceView,
} from './types/civic';
import { formatSlaStatus, SAMPLE_EVIDENCE_IMAGES } from './utils/priorityEngine';

type StatusSegment = 'all' | 'open' | 'active' | 'resolved';
type SortOption = 'priority' | 'sla' | 'corroborations' | 'newest';

interface CivicTrackProps {
  mapsAvailable?: boolean;
}

export const CivicTrack: React.FC<CivicTrackProps> = ({ mapsAvailable = false }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const [activeView, setActiveView] = useState<WorkspaceView>('queue');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Filters & sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [statusSegment, setStatusSegment] = useState<StatusSegment>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [wardFilter, setWardFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('priority');

  // Modals & drawers
  const [modalOpen, setModalOpen] = useState(false);
  const [editingComplaint, setEditingComplaint] = useState<Complaint | null>(null);
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);
  const [corroboratingIds, setCorroboratingIds] = useState<Record<string, boolean>>({});
  const [avatarError, setAvatarError] = useState(false);
  const [heroImgError, setHeroImgError] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAvatarError(false);
      if (nextUser) {
        try {
          const [adminStatus] = await Promise.all([
            checkUserIsAdmin(nextUser),
            syncPrivateUserProfile(nextUser),
          ]);
          setIsAdmin(adminStatus);
        } catch {
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
        setComplaints([]);
        setSelectedComplaintId(null);
      }
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;

    setDataLoading(true);
    setDataError(null);
    const q = query(collection(db, 'complaints'), orderBy('priorityScore', 'desc'));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const items: Complaint[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Complaint, 'id'>),
        }));
        setComplaints(items);
        setDataLoading(false);
      },
      (err) => {
        setDataLoading(false);
        setDataError('Unable to load live complaint records from Firestore.');
        handleFirestoreError(err, OperationType.LIST, 'complaints');
      }
    );

    return () => unsub();
  }, [authReady, user?.uid]);

  const selectedComplaint = useMemo(
    () => complaints.find((c) => c.id === selectedComplaintId) || null,
    [complaints, selectedComplaintId]
  );

  const handleSignIn = async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Google sign-in was cancelled or blocked.'
      );
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const handleSaveComplaint = async (data: {
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
  }) => {
    if (!user) return;
    if (editingComplaint) {
      await updateOwnSubmittedComplaint(editingComplaint, data);
    } else {
      const createdId = await createComplaint(user, data);
      setSelectedComplaintId(createdId);
    }
  };

  const handleQuickCorroborate = async (
    e: React.MouseEvent,
    complaint: Complaint
  ) => {
    e.stopPropagation();
    if (!user || complaint.status === 'Closed' || corroboratingIds[complaint.id]) return;

    setDataError(null);
    setCorroboratingIds((prev) => ({ ...prev, [complaint.id]: true }));
    try {
      await corroborateComplaint(user, complaint);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('Missing or insufficient permissions')) {
        setDataError(
          `You have already corroborated ${complaint.trackingCode}, or the case is closed.`
        );
      } else {
        setDataError('Unable to record corroboration right now.');
      }
    } finally {
      setCorroboratingIds((prev) => ({ ...prev, [complaint.id]: false }));
    }
  };

  const handleSeedSamples = async () => {
    if (!user || seeding) return;
    setSeeding(true);
    setDataError(null);
    try {
      await seedSampleCivicCases(user, isAdmin);
    } catch {
      setDataError('Could not load sample civic cases.');
    } finally {
      setSeeding(false);
    }
  };

  const filteredComplaints = useMemo(() => {
    let list = [...complaints];

    if (activeView === 'submissions' && user) {
      list = list.filter((c) => c.reporterId === user.uid);
    }

    if (statusSegment === 'open') {
      list = list.filter((c) => c.status === 'Submitted' || c.status === 'Triaged');
    } else if (statusSegment === 'active') {
      list = list.filter((c) => c.status === 'Dispatched' || c.status === 'In Progress');
    } else if (statusSegment === 'resolved') {
      list = list.filter((c) => c.status === 'Resolved' || c.status === 'Closed');
    }

    if (categoryFilter !== 'all') {
      list = list.filter((c) => c.category === categoryFilter);
    }

    if (tierFilter !== 'all') {
      list = list.filter((c) => c.priorityTier === tierFilter);
    }

    if (wardFilter !== 'all') {
      list = list.filter((c) => c.ward === wardFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.trackingCode.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.locationLabel.toLowerCase().includes(q) ||
          c.ward.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      if (sortBy === 'priority') return b.priorityScore - a.priorityScore;
      if (sortBy === 'corroborations') return b.corroborationCount - a.corroborationCount;
      if (sortBy === 'newest') {
        const aMs = a.createdAt ? a.createdAt.toMillis() : 0;
        const bMs = b.createdAt ? b.createdAt.toMillis() : 0;
        return bMs - aMs;
      }
      // SLA Urgency
      const aSla = formatSlaStatus(
        a.createdAt ? a.createdAt.toMillis() : null,
        a.slaTargetHours,
        a.status
      );
      const bSla = formatSlaStatus(
        b.createdAt ? b.createdAt.toMillis() : null,
        b.slaTargetHours,
        b.status
      );
      const aClosed = a.status === 'Resolved' || a.status === 'Closed';
      const bClosed = b.status === 'Resolved' || b.status === 'Closed';
      if (aClosed !== bClosed) return aClosed ? 1 : -1;
      return aSla.remainingHours - bSla.remainingHours;
    });

    return list;
  }, [
    complaints,
    activeView,
    user,
    statusSegment,
    categoryFilter,
    tierFilter,
    wardFilter,
    searchQuery,
    sortBy,
  ]);

  const kpis = useMemo(() => {
    const open = complaints.filter((c) => c.status !== 'Resolved' && c.status !== 'Closed');
    const critical = open.filter((c) => c.priorityTier === 'P1 Critical');
    const resolved = complaints.filter((c) => c.status === 'Resolved' || c.status === 'Closed');
    const avgScore =
      open.length > 0
        ? Math.round((open.reduce((acc, c) => acc + c.priorityScore, 0) / open.length) * 10) / 10
        : 0;
    return {
      openCount: open.length,
      criticalCount: critical.length,
      avgScore,
      resolvedCount: resolved.length,
    };
  }, [complaints]);

  const wardCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of complaints) {
      if (c.status !== 'Resolved' && c.status !== 'Closed') {
        map.set(c.ward, (map.get(c.ward) || 0) + 1);
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [complaints]);

  const handleExportCsv = () => {
    const headers = [
      'TrackingCode',
      'Title',
      'Category',
      'Ward',
      'Location',
      'PriorityScore',
      'PriorityTier',
      'Status',
      'Department',
      'Crew',
      'Corroborations',
      'SLATargetHours',
    ];
    const escape = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`;
    const rows = filteredComplaints.map((c) =>
      [
        c.trackingCode,
        c.title,
        c.category,
        c.ward,
        c.locationLabel,
        c.priorityScore,
        c.priorityTier,
        c.status,
        c.assignedDepartment,
        c.assignedCrew,
        c.corroborationCount,
        c.slaTargetHours,
      ]
        .map(escape)
        .join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `civictrack-queue-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm text-slate-600">Loading CivicTrack workspace...</div>
      </div>
    );
  }

  // Signed-out Portal View
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
        {/* Strict 3-Zone Top Bar Contract */}
        <header className="bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
            <a
              href="#top"
              className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display"
            >
              CivicTrack
            </a>

            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
              <a
                href="#scoring-model"
                className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
              >
                Scoring Model
              </a>
              <a
                href="#sla-governance"
                className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
              >
                SLA Targets
              </a>
              <a
                href="#audit-trail"
                className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
              >
                Audit Trail
              </a>
            </nav>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={handleSignIn}
                disabled={signingIn}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
              >
                {signingIn ? 'Signing in...' : 'Sign In'}
              </button>
            </div>
          </div>
        </header>

        <main id="top" className="flex-1">
          <div className="max-w-7xl mx-auto px-6 py-12 lg:py-16 space-y-12">
            {/* Hero 2-Column Balanced Split */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              <div className="lg:col-span-7 flex flex-col justify-between bg-white border border-slate-200 rounded-lg p-8 lg:p-10 space-y-6">
                <div className="space-y-4">
                  <div className="text-xs font-medium text-blue-700">
                    Municipal Complaint Prioritization &amp; Resolution Operations
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 leading-tight [text-wrap:balance] max-w-2xl">
                    Triage citizen infrastructure complaints by verified risk, not inbox order.
                  </h1>
                  <p className="text-base text-slate-600 leading-relaxed max-w-xl">
                    CivicTrack scores every public hazard report using infrastructure severity, safety impact, geographic footprint, and citizen corroborations—then tracks crew dispatch and resolution through an immutable audit timeline.
                  </p>
                </div>

                <div className="space-y-4 pt-2">
                  {authError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-800">
                      {authError}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      onClick={handleSignIn}
                      disabled={signingIn}
                      className="px-5 py-2.5 text-sm font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                    >
                      {signingIn ? 'Connecting...' : 'Sign In with Google to Open Queue'}
                    </button>
                    <span className="text-xs text-slate-500">
                      Verified Google account required for filing, corroborating, and dispatch logs.
                    </span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
                <div className="relative flex-1 min-h-[260px] bg-slate-100">
                  {!heroImgError ? (
                    <img
                      src={SAMPLE_EVIDENCE_IMAGES.waterMain}
                      alt="Municipal water main inspection scene with safety cones"
                      referrerPolicy="no-referrer"
                      onError={() => setHeroImgError(true)}
                      className="w-full h-full lg:h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-slate-500">
                      <Layers className="w-8 h-8 mb-2 text-slate-400" />
                      <span className="text-xs font-medium text-slate-700">
                        Field Inspection Evidence Preview
                      </span>
                    </div>
                  )}
                </div>
                <div className="px-5 py-3.5 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                  <span>Ward 04 · Water &amp; Drainage</span>
                  <span className="font-mono tabular-nums font-semibold text-red-700">
                    P1 Critical · 4h SLA
                  </span>
                </div>
              </div>
            </section>

            {/* Full-Width 4-Column SLA Benchmark Strip Below Hero Split */}
            <section
              id="sla-governance"
              className="bg-white border border-slate-200 rounded-lg grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200"
            >
              <div className="p-6">
                <div className="text-xs text-slate-500">P1 Critical Threshold</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-red-700 mt-1">
                  4h SLA
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Score 80–100 · Immediate life-safety or corridor outage response.
                </p>
              </div>
              <div className="p-6">
                <div className="text-xs text-slate-500">P2 High Threshold</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-1">
                  12h SLA
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Score 60–79 · Same-day crew dispatch and hazard containment.
                </p>
              </div>
              <div className="p-6">
                <div className="text-xs text-slate-500">P3 Moderate Threshold</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-blue-700 mt-1">
                  48h SLA
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Score 38–59 · Scheduled district maintenance rotation.
                </p>
              </div>
              <div className="p-6">
                <div className="text-xs text-slate-500">P4 Routine Threshold</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                  120h SLA
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Score 0–37 · Standard municipal backlog window.
                </p>
              </div>
            </section>

            {/* Mechanism Overview */}
            <section
              id="scoring-model"
              className="grid grid-cols-1 md:grid-cols-3 gap-6"
            >
              <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  01. Transparent Priority Weighting
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Every complaint combines Severity (35%), Public Safety Risk (30%), Affected Footprint (20%), and logarithmic Citizen Corroboration (15%) into a live 0–100 score.
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  02. Atomic Citizen Corroboration
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Residents verify active hazards once per account in an atomic transaction that updates both the corroboration count and SLA priority tier in real time.
                </p>
              </div>
              <div id="audit-trail" className="bg-white border border-slate-200 rounded-lg p-6 space-y-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  03. End-to-End Resolution Ledger
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Every triage assessment, department assignment, crew dispatch, and completion note is recorded chronologically on an append-only resolution timeline.
                </p>
              </div>
            </section>
          </div>
        </main>
      </div>
    );
  }

  const viewLabels: Record<WorkspaceView, string> = {
    queue: 'Priority Queue',
    map: 'Incident Map',
    tracker: 'Resolution Tracker',
    matrix: 'Priority Matrix',
    submissions: 'My Submissions',
  };

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    statusSegment !== 'all' ||
    categoryFilter !== 'all' ||
    tierFilter !== 'all' ||
    wardFilter !== 'all';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Mobile Sidebar Backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/35 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Left Workspace Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-150 lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display">
            CivicTrack
          </span>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          <div className="space-y-1">
            <div className="px-2.5 pb-1 text-xs font-medium text-slate-500">Workspace</div>
            {(
              [
                { id: 'queue', label: 'Priority Queue', icon: ListFilter },
                { id: 'map', label: 'Incident Map', icon: MapPin },
                { id: 'tracker', label: 'Resolution Tracker', icon: Layers },
                { id: 'matrix', label: 'Priority Matrix', icon: SlidersHorizontal },
                { id: 'submissions', label: 'My Submissions', icon: FileText },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveView(item.id);
                    setMobileNavOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-blue-50 text-blue-800'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="space-y-1 pt-4 border-t border-slate-200">
            <div className="px-2.5 pb-1 flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Active Wards</span>
              {wardFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setWardFilter('all')}
                  className="text-blue-700 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
            {wardCounts.length === 0 ? (
              <div className="px-2.5 py-1.5 text-xs text-slate-500">No open ward cases</div>
            ) : (
              wardCounts.map(([ward, count]) => (
                <button
                  key={ward}
                  type="button"
                  onClick={() => {
                    setWardFilter(wardFilter === ward ? 'all' : ward);
                    setActiveView('queue');
                    setMobileNavOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                    wardFilter === ward
                      ? 'bg-blue-50 text-blue-800 font-medium'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="truncate">{ward}</span>
                  <span className="font-mono tabular-nums text-slate-500 ml-2 shrink-0">
                    {count}
                  </span>
                </button>
              ))
            )}
          </div>
        </nav>

        {/* Signed-in Operator / Citizen Profile Footer */}
        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="flex items-center gap-3">
            {user.photoURL && !avatarError ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'User profile'}
                referrerPolicy="no-referrer"
                onError={() => setAvatarError(true)}
                className="w-9 h-9 rounded-md object-cover border border-slate-200 shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-semibold text-slate-700 shrink-0">
                {(user.displayName || user.email || 'C').slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-slate-900 truncate">
                {user.displayName || 'Verified User'}
              </div>
              <div className="text-xs text-slate-500 truncate">
                {isAdmin ? 'Municipal Dispatcher' : 'Verified Citizen'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract */}
        <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-1.5 text-slate-600 hover:text-slate-900 rounded-md hover:bg-slate-100"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 whitespace-nowrap shrink-0">CivicTrack</span>
              <span className="text-slate-300" aria-hidden="true">/</span>
              <h1 className="font-semibold text-slate-900 truncate">
                {viewLabels[activeView]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setEditingComplaint(null);
                setModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>File Complaint</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
          {dataError && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-md flex items-center justify-between gap-4 text-xs text-red-800">
              <span>{dataError}</span>
              <button
                type="button"
                onClick={() => setDataError(null)}
                className="font-medium underline shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* 4-Column KPI Summary Strip */}
          <section
            aria-label="Queue metrics"
            className="bg-white border border-slate-200 rounded-lg grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200"
          >
            <div className="px-5 py-4">
              <div className="text-xs text-slate-500">Active Open Cases</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {kpis.openCount}
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="text-xs text-slate-500">P1 Critical Queue</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-red-700 mt-1">
                {kpis.criticalCount}
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="text-xs text-slate-500">Mean Open Priority</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {kpis.avgScore}
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="text-xs text-slate-500">Resolved &amp; Closed</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                {kpis.resolvedCount}
              </div>
            </div>
          </section>

          {activeView === 'matrix' ? (
            <PriorityMatrixView
              complaints={complaints}
              onSelectComplaint={(c) => setSelectedComplaintId(c.id)}
            />
          ) : activeView === 'map' ? (
            <ComplaintMapView
              mapsAvailable={mapsAvailable}
              complaints={complaints}
              user={user}
              isAdmin={isAdmin}
              onSelectComplaint={(c) => setSelectedComplaintId(c.id)}
            />
          ) : activeView === 'tracker' ? (
            <ResolutionTrackerView
              complaints={complaints}
              onSelectComplaint={(c) => setSelectedComplaintId(c.id)}
            />
          ) : (
            <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              {/* Filter & Search Toolbar */}
              <div className="p-4 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Segmented Status Controls */}
                  <div className="inline-flex items-center p-1 bg-slate-100 rounded-md">
                    {(
                      [
                        { id: 'all', label: 'All' },
                        { id: 'open', label: 'Intake' },
                        { id: 'active', label: 'In Progress' },
                        { id: 'resolved', label: 'Resolved' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setStatusSegment(tab.id)}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                          statusSegment === tab.id
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <select
                    aria-label="Filter by category"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-700"
                  >
                    <option value="all">All Categories</option>
                    {COMPLAINT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Filter by priority tier"
                    value={tierFilter}
                    onChange={(e) => setTierFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-700"
                  >
                    <option value="all">All Priorities</option>
                    {PRIORITY_TIERS.map((tier) => (
                      <option key={tier} value={tier}>
                        {tier}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search CT-code, street, or issue..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-700"
                    />
                  </div>

                  <select
                    aria-label="Sort complaints"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-700"
                  >
                    <option value="priority">Sort: Priority Score</option>
                    <option value="sla">Sort: SLA Urgency</option>
                    <option value="corroborations">Sort: Corroborations</option>
                    <option value="newest">Sort: Newest</option>
                  </select>

                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setStatusSegment('all');
                        setCategoryFilter('all');
                        setTierFilter('all');
                        setWardFilter('all');
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
                    >
                      Reset
                    </button>
                  )}

                  {filteredComplaints.length > 0 && (
                    <button
                      type="button"
                      onClick={handleExportCsv}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export CSV</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Data Grid States: Loading, Empty, Populated */}
              {dataLoading ? (
                <div className="divide-y divide-slate-200">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <div key={n} className="px-5 py-3.5 flex items-center justify-between gap-4">
                      <div className="h-4 w-20 bg-slate-100 rounded animate-pulse" />
                      <div className="h-4 flex-1 max-w-md bg-slate-100 rounded animate-pulse" />
                      <div className="h-4 w-24 bg-slate-100 rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : filteredComplaints.length === 0 ? (
                <div className="px-6 py-14 text-center max-w-md mx-auto space-y-3">
                  <UserCheck className="w-7 h-7 text-slate-400 mx-auto" />
                  <h2 className="text-sm font-semibold text-slate-900">
                    {complaints.length === 0
                      ? 'No citizen complaints logged yet'
                      : 'No complaints match your active filters'}
                  </h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {complaints.length === 0
                      ? 'File a new civic infrastructure report to calculate its SLA priority, or load realistic municipal cases to test prioritization and dispatch tracking.'
                      : 'Adjust your search query or reset status and ward filters to view all active records.'}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingComplaint(null);
                        setModalOpen(true);
                      }}
                      className="px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 whitespace-nowrap shrink-0"
                    >
                      File First Complaint
                    </button>
                    {complaints.length === 0 && (
                      <button
                        type="button"
                        onClick={handleSeedSamples}
                        disabled={seeding}
                        className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap shrink-0"
                      >
                        {seeding ? 'Loading cases...' : 'Load Sample Civic Cases'}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                        <th className="py-2.5 px-4 whitespace-nowrap">Case ID</th>
                        <th className="py-2.5 px-4">Complaint &amp; Location</th>
                        <th className="py-2.5 px-4 whitespace-nowrap text-right">Priority</th>
                        <th className="py-2.5 px-4 whitespace-nowrap text-right">Corroborations</th>
                        <th className="py-2.5 px-4 whitespace-nowrap">Status &amp; Assignment</th>
                        <th className="py-2.5 px-4 whitespace-nowrap text-right">SLA Window</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {filteredComplaints.map((c) => {
                        const createdMs = c.createdAt ? c.createdAt.toMillis() : null;
                        const sla = formatSlaStatus(createdMs, c.slaTargetHours, c.status);

                        return (
                          <tr
                            key={c.id}
                            onClick={() => setSelectedComplaintId(c.id)}
                            className="hover:bg-slate-50 cursor-pointer transition-colors"
                          >
                            <td className="py-3 px-4 font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap align-top">
                              {c.trackingCode}
                            </td>

                            <td className="py-3 px-4 align-top min-w-[260px]">
                              <div className="text-sm font-medium text-slate-900 leading-snug">
                                {c.title}
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5">
                                {c.category}
                                <span aria-hidden="true"> · </span>
                                {c.locationLabel}
                                <span aria-hidden="true"> · </span>
                                {c.ward}
                              </div>
                            </td>

                            <td className="py-3 px-4 text-right align-top whitespace-nowrap">
                              <div className="font-mono tabular-nums font-semibold text-slate-900">
                                {c.priorityScore}
                              </div>
                              <div
                                className={
                                  c.priorityTier === 'P1 Critical'
                                    ? 'text-red-700 font-semibold'
                                    : c.priorityTier === 'P2 High'
                                      ? 'text-amber-700 font-semibold'
                                      : c.priorityTier === 'P3 Moderate'
                                        ? 'text-blue-700 font-medium'
                                        : 'text-slate-600'
                                }
                              >
                                {c.priorityTier}
                              </div>
                            </td>

                            <td className="py-3 px-4 text-right align-top whitespace-nowrap">
                              <div className="inline-flex items-center justify-end gap-2">
                                <span className="font-mono tabular-nums font-medium text-slate-900">
                                  {c.corroborationCount}
                                </span>
                                {c.status !== 'Closed' && (
                                  <button
                                    type="button"
                                    onClick={(e) => handleQuickCorroborate(e, c)}
                                    disabled={Boolean(corroboratingIds[c.id])}
                                    title="Corroborate this complaint (+1)"
                                    className="inline-flex items-center gap-0.5 px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded transition-colors disabled:opacity-50"
                                  >
                                    <ArrowUpRight className="w-3 h-3" />
                                    <span>+1</span>
                                  </button>
                                )}
                              </div>
                            </td>

                            <td className="py-3 px-4 align-top whitespace-nowrap">
                              <div
                                className={`font-medium ${
                                  c.status === 'Resolved' || c.status === 'Closed'
                                    ? 'text-emerald-700'
                                    : c.status === 'In Progress' || c.status === 'Dispatched'
                                      ? 'text-blue-700'
                                      : 'text-slate-900'
                                }`}
                              >
                                {c.status}
                              </div>
                              <div className="text-slate-500 mt-0.5">
                                {c.assignedDepartment}
                              </div>
                            </td>

                            <td className="py-3 px-4 text-right align-top whitespace-nowrap">
                              <div
                                className={`font-mono tabular-nums font-medium ${
                                  sla.isOverdue
                                    ? 'text-red-700'
                                    : sla.isWarning
                                      ? 'text-amber-700'
                                      : c.status === 'Resolved' || c.status === 'Closed'
                                        ? 'text-emerald-700'
                                        : 'text-slate-900'
                                }`}
                              >
                                {sla.label}
                              </div>
                              <div className="text-slate-500 font-mono tabular-nums mt-0.5">
                                {c.slaTargetHours}h target
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </main>
      </div>

      {/* Modals & Drawers */}
      <ComplaintModal
        isOpen={modalOpen}
        mapsAvailable={mapsAvailable}
        editingComplaint={editingComplaint}
        onClose={() => {
          setModalOpen(false);
          setEditingComplaint(null);
        }}
        onSubmit={handleSaveComplaint}
      />

      <CaseDetailDrawer
        complaint={selectedComplaint}
        mapsAvailable={mapsAvailable}
        user={user}
        isAdmin={isAdmin}
        onClose={() => setSelectedComplaintId(null)}
        onEditOwn={(cmp) => {
          setEditingComplaint(cmp);
          setModalOpen(true);
        }}
      />
    </div>
  );
};

export default CivicTrack;
