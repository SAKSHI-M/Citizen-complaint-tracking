import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { AdvancedMarker, Map as GoogleMap, Pin } from '@vis.gl/react-google-maps';
import { ArrowUpRight, Check, FileWarning, Pencil, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  addResolutionNote,
  corroborateComplaint,
  dispatchAndUpdateComplaint,
} from '../services/civicService';
import {
  AFFECTED_SCOPES,
  COMPLAINT_STATUSES,
  DEPARTMENTS,
  type AffectedScope,
  type Complaint,
  type ComplaintStatus,
  type ResolutionUpdate,
} from '../types/civic';
import {
  calculatePriority,
  formatSlaStatus,
  getSuggestedDepartment,
} from '../utils/priorityEngine';

interface CaseDetailDrawerProps {
  complaint: Complaint | null;
  mapsAvailable: boolean;
  user: User;
  isAdmin: boolean;
  onClose: () => void;
  onEditOwn: (complaint: Complaint) => void;
}

export const CaseDetailDrawer: React.FC<CaseDetailDrawerProps> = ({
  complaint,
  mapsAvailable,
  user,
  isAdmin,
  onClose,
  onEditOwn,
}) => {
  const [updates, setUpdates] = useState<ResolutionUpdate[]>([]);
  const [updatesLoading, setUpdatesLoading] = useState(false);
  const [hasCorroborated, setHasCorroborated] = useState(false);
  const [corrobNote, setCorrobNote] = useState('');
  const [corrobBusy, setCorrobBusy] = useState(false);
  const [fieldNote, setFieldNote] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  // Dispatcher triage state
  const [dispSeverity, setDispSeverity] = useState(3);
  const [dispSafety, setDispSafety] = useState(3);
  const [dispScope, setDispScope] = useState<AffectedScope>('Block Level');
  const [dispStatus, setDispStatus] = useState<ComplaintStatus>('Submitted');
  const [dispDept, setDispDept] = useState('Unassigned');
  const [dispCrew, setDispCrew] = useState('Pending Dispatch');
  const [dispNote, setDispNote] = useState('');
  const [dispBusy, setDispBusy] = useState(false);

  useEffect(() => {
    setActionError(null);
    setImageFailed(false);
    setCorrobNote('');
    setFieldNote('');
    setDispNote('');
    if (!complaint) return;

    setDispSeverity(complaint.severity);
    setDispSafety(complaint.safetyImpact);
    setDispScope(complaint.affectedScope);
    setDispStatus(complaint.status);
    setDispDept(
      complaint.assignedDepartment === 'Unassigned'
        ? getSuggestedDepartment(complaint.category)
        : complaint.assignedDepartment
    );
    setDispCrew(complaint.assignedCrew);

    setUpdatesLoading(true);
    const updatesPath = `complaints/${complaint.id}/updates`;
    const q = query(
      collection(db, 'complaints', complaint.id, 'updates'),
      orderBy('createdAt', 'desc')
    );

    const unsubUpdates = onSnapshot(
      q,
      (snap) => {
        const list: ResolutionUpdate[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ResolutionUpdate, 'id'>),
        }));
        setUpdates(list);
        setUpdatesLoading(false);
      },
      (err) => {
        setUpdatesLoading(false);
        handleFirestoreError(err, OperationType.GET, updatesPath);
      }
    );

    const corrobPath = `complaints/${complaint.id}/corroborations/${user.uid}`;
    const unsubCorrob = onSnapshot(
      doc(db, 'complaints', complaint.id, 'corroborations', user.uid),
      (snap) => {
        setHasCorroborated(snap.exists());
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, corrobPath);
      }
    );

    return () => {
      unsubUpdates();
      unsubCorrob();
    };
  }, [complaint?.id, user.uid]);

  if (!complaint) return null;

  const breakdown = calculatePriority(
    complaint.severity,
    complaint.safetyImpact,
    complaint.affectedScope,
    complaint.corroborationCount
  );

  const projectedDispatch = calculatePriority(
    dispSeverity,
    dispSafety,
    dispScope,
    complaint.corroborationCount
  );

  const createdMs = complaint.createdAt ? complaint.createdAt.toMillis() : null;
  const sla = formatSlaStatus(createdMs, complaint.slaTargetHours, complaint.status);
  const canEditOwn =
    complaint.reporterId === user.uid && complaint.status === 'Submitted';

  const handleCorroborate = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setCorrobBusy(true);
    try {
      await corroborateComplaint(user, complaint, corrobNote);
      setCorrobNote('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to corroborate.');
    } finally {
      setCorrobBusy(false);
    }
  };

  const handleDispatcherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    if (dispNote.trim().length < 2) {
      setActionError('Enter a brief dispatch or resolution note for the public audit log.');
      return;
    }
    setDispBusy(true);
    try {
      await dispatchAndUpdateComplaint(user, complaint, {
        severity: dispSeverity,
        safetyImpact: dispSafety,
        affectedScope: dispScope,
        status: dispStatus,
        assignedDepartment: dispDept,
        assignedCrew: dispCrew.trim() || 'Pending Dispatch',
        note: dispNote.trim(),
      });
      setDispNote('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to update complaint.');
    } finally {
      setDispBusy(false);
    }
  };

  const handleFieldNote = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    if (fieldNote.trim().length < 2) {
      setActionError('Note must contain at least 2 characters.');
      return;
    }
    setNoteBusy(true);
    try {
      await addResolutionNote(user, complaint, fieldNote.trim(), isAdmin);
      setFieldNote('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to post note.');
    } finally {
      setNoteBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-slate-900/35"
      role="dialog"
      aria-modal="true"
      aria-label={`Case ${complaint.trackingCode}`}
    >
      <div className="w-full max-w-2xl bg-white h-full border-l border-slate-200 flex flex-col overflow-hidden">
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
              <span className="font-semibold text-slate-900">{complaint.trackingCode}</span>
              <span aria-hidden="true">·</span>
              <span>{complaint.category}</span>
              <span aria-hidden="true">·</span>
              <span>{complaint.ward}</span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mt-1 leading-snug">
              {complaint.title}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canEditOwn && (
              <button
                type="button"
                onClick={() => onEditOwn(complaint)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100 transition-colors"
              aria-label="Close case drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Drawer Scroll Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {actionError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-800">
              {actionError}
            </div>
          )}

          {/* Status & SLA Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-5 border-b border-slate-200">
            <div>
              <div className="text-xs text-slate-500">Priority Index</div>
              <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                {complaint.priorityScore}/100
              </div>
              <div
                className={`text-xs font-medium mt-0.5 ${
                  complaint.priorityTier === 'P1 Critical'
                    ? 'text-red-700'
                    : complaint.priorityTier === 'P2 High'
                      ? 'text-amber-700'
                      : 'text-blue-700'
                }`}
              >
                {complaint.priorityTier}
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-500">Lifecycle Status</div>
              <div className="text-sm font-semibold text-slate-900 mt-1">
                {complaint.status}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 truncate">
                {complaint.assignedDepartment}
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-500">SLA Window</div>
              <div
                className={`text-sm font-semibold font-mono tabular-nums mt-1 ${
                  sla.isOverdue
                    ? 'text-red-700'
                    : sla.isWarning
                      ? 'text-amber-700'
                      : 'text-slate-900'
                }`}
              >
                {sla.label}
              </div>
              <div className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                {complaint.slaTargetHours}h target
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-500">Corroborations</div>
              <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                {complaint.corroborationCount}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Verified citizens</div>
            </div>
          </div>

          {/* Evidence Photo & Location */}
          {complaint.evidenceImageUrl && (
            <div className="space-y-2 pb-5 border-b border-slate-200">
              <div className="text-xs font-medium text-slate-700">Field Inspection Evidence</div>
              <div className="aspect-[4/3] w-full max-h-64 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                {!imageFailed ? (
                  <img
                    src={complaint.evidenceImageUrl}
                    alt={`Inspection evidence for ${complaint.locationLabel}`}
                    referrerPolicy="no-referrer"
                    onError={() => setImageFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 p-4 text-center">
                    <FileWarning className="w-6 h-6 mb-2 text-slate-400" />
                    <span className="text-xs font-medium text-slate-700">
                      Inspection photo unavailable
                    </span>
                    <span className="text-xs text-slate-500 mt-0.5">{complaint.locationLabel}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Description & Reporter Details */}
          <div className="space-y-3 pb-5 border-b border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>Location: <strong className="font-medium text-slate-900">{complaint.locationLabel}</strong></span>
              <span>
                Reported by <strong className="font-medium text-slate-900">{complaint.reporterName}</strong>
                {' · '}Crew: <strong className="font-medium text-slate-900">{complaint.assignedCrew}</strong>
              </span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{complaint.description}</p>
            {mapsAvailable &&
              typeof complaint.lat === 'number' &&
              typeof complaint.lng === 'number' && (
                <div className="pt-2 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Mapped Location</span>
                    <span className="font-mono tabular-nums">
                      {complaint.lat.toFixed(5)}, {complaint.lng.toFixed(5)}
                    </span>
                  </div>
                  <div className="w-full h-40 rounded-md overflow-hidden border border-slate-200 bg-slate-100">
                    <GoogleMap
                      mapId="DEMO_MAP_ID"
                      center={{ lat: complaint.lat, lng: complaint.lng }}
                      zoom={15}
                      gestureHandling="cooperative"
                      disableDefaultUI={true}
                      zoomControl={true}
                      internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                      style={{ width: '100%', height: '100%' }}
                    >
                      <AdvancedMarker
                        position={{ lat: complaint.lat, lng: complaint.lng }}
                        title={complaint.locationLabel}
                      >
                        <Pin background="#1D4ED8" borderColor="#1E3A8A" glyphColor="#FFFFFF" />
                      </AdvancedMarker>
                    </GoogleMap>
                  </div>
                </div>
              )}
          </div>

          {/* Transparent Priority Scoring Breakdown */}
          <div className="space-y-3 pb-5 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-900">
                Priority Weight Breakdown
              </h3>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                Score = {breakdown.severityPoints} + {breakdown.safetyPoints} + {breakdown.scopePoints} + {breakdown.corroborationPoints} = {breakdown.totalScore}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                <div className="text-slate-500">Severity (35%)</div>
                <div className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                  {complaint.severity}/5 · +{breakdown.severityPoints}
                </div>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                <div className="text-slate-500">Safety Risk (30%)</div>
                <div className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                  {complaint.safetyImpact}/5 · +{breakdown.safetyPoints}
                </div>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                <div className="text-slate-500">Footprint (20%)</div>
                <div className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                  +{breakdown.scopePoints}
                </div>
                <div className="text-slate-500 truncate">{complaint.affectedScope}</div>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                <div className="text-slate-500">Citizen Boost (15%)</div>
                <div className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                  {complaint.corroborationCount} votes · +{breakdown.corroborationPoints}
                </div>
              </div>
            </div>
          </div>

          {/* Citizen Corroboration Action */}
          {complaint.status !== 'Closed' && (
            <div className="pb-5 border-b border-slate-200">
              <h3 className="text-xs font-semibold text-slate-900 mb-2">
                Citizen Corroboration
              </h3>
              {hasCorroborated ? (
                <div className="flex items-center gap-2 text-xs text-emerald-700 font-medium py-2">
                  <Check className="w-4 h-4" />
                  <span>You corroborated this complaint. Your verification is factored into its priority score.</span>
                </div>
              ) : (
                <form onSubmit={handleCorroborate} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    maxLength={240}
                    value={corrobNote}
                    onChange={(e) => setCorrobNote(e.target.value)}
                    placeholder="Optional observation (e.g., water reached crosswalk at 08:15)..."
                    className="flex-1 px-3 py-2 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-700"
                  />
                  <button
                    type="submit"
                    disabled={corrobBusy}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    {corrobBusy ? 'Submitting...' : 'Corroborate (+1)'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Municipal Dispatcher Controls (Admin Only) */}
          {isAdmin && (
            <form
              onSubmit={handleDispatcherSubmit}
              className="space-y-4 pb-5 border-b border-slate-200"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-900">
                  Municipal Triage &amp; Dispatch Controls
                </h3>
                <span className="text-xs font-mono tabular-nums text-slate-600">
                  New score: <strong>{projectedDispatch.totalScore}/100</strong> ({projectedDispatch.tier})
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Lifecycle Status</label>
                  <select
                    value={dispStatus}
                    onChange={(e) => setDispStatus(e.target.value as ComplaintStatus)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-700"
                  >
                    {COMPLAINT_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-600 mb-1">Assigned Department</label>
                  <select
                    value={dispDept}
                    onChange={(e) => setDispDept(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-700"
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-600 mb-1">Field Crew / Unit</label>
                  <input
                    type="text"
                    maxLength={80}
                    value={dispCrew}
                    onChange={(e) => setDispCrew(e.target.value)}
                    placeholder="e.g., Crew Alpha-2"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Severity (1–5)</label>
                  <select
                    value={dispSeverity}
                    onChange={(e) => setDispSeverity(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md tabular-nums"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Safety Risk (1–5)</label>
                  <select
                    value={dispSafety}
                    onChange={(e) => setDispSafety(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md tabular-nums"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Footprint</label>
                  <select
                    value={dispScope}
                    onChange={(e) => setDispScope(e.target.value as AffectedScope)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                  >
                    {AFFECTED_SCOPES.map((sc) => (
                      <option key={sc} value={sc}>
                        {sc}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  maxLength={600}
                  value={dispNote}
                  onChange={(e) => setDispNote(e.target.value)}
                  placeholder="Required audit note (e.g., Dispatched Signal Van 2 to replace controller)..."
                  className="flex-1 px-3 py-2 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-700"
                />
                <button
                  type="submit"
                  disabled={dispBusy}
                  className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                >
                  {dispBusy ? 'Updating...' : 'Apply Dispatch Update'}
                </button>
              </div>
            </form>
          )}

          {/* Resolution Audit Trail */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-900">
                Resolution Audit Timeline
              </h3>
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                {updates.length} entries
              </span>
            </div>

            {complaint.status !== 'Closed' && (
              <form onSubmit={handleFieldNote} className="flex gap-2">
                <input
                  type="text"
                  maxLength={600}
                  value={fieldNote}
                  onChange={(e) => setFieldNote(e.target.value)}
                  placeholder="Post a status inquiry or field observation..."
                  className="flex-1 px-3 py-2 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-700"
                />
                <button
                  type="submit"
                  disabled={noteBusy}
                  className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                >
                  {noteBusy ? 'Posting...' : 'Add Note'}
                </button>
              </form>
            )}

            {updatesLoading ? (
              <div className="space-y-2 py-2">
                <div className="h-12 bg-slate-100 rounded animate-pulse" />
                <div className="h-12 bg-slate-100 rounded animate-pulse" />
              </div>
            ) : updates.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">
                No timeline entries logged yet.
              </p>
            ) : (
              <ol className="divide-y divide-slate-100 border-t border-slate-200">
                {updates.map((u) => {
                  const tsLabel = u.createdAt
                    ? u.createdAt.toDate().toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Pending sync';

                  return (
                    <li key={u.id} className="py-3 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">{u.actionType}</span>
                          {u.fromStatus !== u.toStatus && (
                            <span className="text-slate-500">
                              {u.fromStatus} → {u.toStatus}
                            </span>
                          )}
                          <span aria-hidden="true" className="text-slate-300">·</span>
                          <span className="text-slate-600">
                            {u.authorName} ({u.authorRole})
                          </span>
                        </div>
                        <span className="font-mono tabular-nums text-slate-500">
                          {tsLabel}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed">{u.note}</p>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
