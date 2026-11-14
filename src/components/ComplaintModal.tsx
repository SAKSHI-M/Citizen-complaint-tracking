import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  AFFECTED_SCOPES,
  COMPLAINT_CATEGORIES,
  WARDS,
  type AffectedScope,
  type Complaint,
  type ComplaintCategory,
} from '../types/civic';
import { calculatePriority, SAMPLE_EVIDENCE_IMAGES } from '../utils/priorityEngine';
import { PlaceLocationPicker } from './PlaceLocationPicker';

interface ComplaintModalProps {
  isOpen: boolean;
  mapsAvailable: boolean;
  editingComplaint: Complaint | null;
  onClose: () => void;
  onSubmit: (data: {
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
  }) => Promise<void>;
}

const EVIDENCE_PRESETS = [
  { label: 'No attachment', url: '' },
  { label: 'Water main inspection photo', url: SAMPLE_EVIDENCE_IMAGES.waterMain },
  { label: 'Traffic signal outage photo', url: SAMPLE_EVIDENCE_IMAGES.trafficSignal },
  { label: 'Storm drain blockage photo', url: SAMPLE_EVIDENCE_IMAGES.stormDrain },
];

export const ComplaintModal: React.FC<ComplaintModalProps> = ({
  isOpen,
  mapsAvailable,
  editingComplaint,
  onClose,
  onSubmit,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ComplaintCategory>('Water & Drainage');
  const [ward, setWard] = useState<string>(WARDS[0]);
  const [locationLabel, setLocationLabel] = useState('');
  const [lat, setLat] = useState<number | undefined>(undefined);
  const [lng, setLng] = useState<number | undefined>(undefined);
  const [severity, setSeverity] = useState<number>(3);
  const [safetyImpact, setSafetyImpact] = useState<number>(3);
  const [affectedScope, setAffectedScope] = useState<AffectedScope>('Block Level');
  const [evidenceImageUrl, setEvidenceImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    if (editingComplaint) {
      setTitle(editingComplaint.title);
      setDescription(editingComplaint.description);
      setCategory(editingComplaint.category);
      setWard(editingComplaint.ward);
      setLocationLabel(editingComplaint.locationLabel);
      setLat(editingComplaint.lat);
      setLng(editingComplaint.lng);
      setSeverity(editingComplaint.severity);
      setSafetyImpact(editingComplaint.safetyImpact);
      setAffectedScope(editingComplaint.affectedScope);
      setEvidenceImageUrl(editingComplaint.evidenceImageUrl || '');
    } else {
      setTitle('');
      setDescription('');
      setCategory('Water & Drainage');
      setWard(WARDS[0]);
      setLocationLabel('');
      setLat(undefined);
      setLng(undefined);
      setSeverity(3);
      setSafetyImpact(3);
      setAffectedScope('Block Level');
      setEvidenceImageUrl('');
    }
  }, [isOpen, editingComplaint]);

  if (!isOpen) return null;

  const livePriority = calculatePriority(
    severity,
    safetyImpact,
    affectedScope,
    editingComplaint?.corroborationCount ?? 0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (title.trim().length < 4) {
      setErrorMessage('Please enter a complaint summary of at least 4 characters.');
      return;
    }
    if (locationLabel.trim().length < 3) {
      setErrorMessage('Please specify a public intersection or location landmark.');
      return;
    }
    if (description.trim().length < 10) {
      setErrorMessage('Please provide at least 10 characters describing the hazard.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        category,
        ward,
        locationLabel: locationLabel.trim(),
        lat,
        lng,
        severity,
        safetyImpact,
        affectedScope,
        evidenceImageUrl: evidenceImageUrl || undefined,
      });
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to save complaint.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="complaint-modal-title"
    >
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="complaint-modal-title" className="text-base font-semibold text-slate-900">
              {editingComplaint ? `Edit Complaint ${editingComplaint.trackingCode}` : 'File Civic Complaint'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Reports enter the municipal triage queue with an automatically calculated SLA target.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100 transition-colors focus-visible:outline-2 focus-visible:outline-blue-700"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5 space-y-5">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-800">
              {errorMessage}
            </div>
          )}

          <div>
            <label htmlFor="cmp-title" className="block text-xs font-medium text-slate-700 mb-1.5">
              Complaint Summary
            </label>
            <input
              id="cmp-title"
              type="text"
              required
              minLength={4}
              maxLength={140}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Broken storm drain grate flooding crosswalk"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cmp-category" className="block text-xs font-medium text-slate-700 mb-1.5">
                Service Category
              </label>
              <select
                id="cmp-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-700"
              >
                {COMPLAINT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="cmp-ward" className="block text-xs font-medium text-slate-700 mb-1.5">
                Administrative Ward
              </label>
              <select
                id="cmp-ward"
                value={ward}
                onChange={(e) => setWard(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-700"
              >
                {WARDS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="cmp-location" className="block text-xs font-medium text-slate-700 mb-1.5">
              Public Intersection or Landmark
            </label>
            <input
              id="cmp-location"
              type="text"
              required
              minLength={3}
              maxLength={140}
              value={locationLabel}
              onChange={(e) => setLocationLabel(e.target.value)}
              placeholder="e.g., Elm St & 14th Ave (Avoid entering private home addresses)"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700"
            />
          </div>

          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-slate-700">
              Pin Exact Coordinates on Google Maps (Optional)
            </span>
            <PlaceLocationPicker
              mapsAvailable={mapsAvailable}
              locationLabel={locationLabel}
              lat={lat}
              lng={lng}
              onLocationChange={(next) => {
                if (next.locationLabel && !locationLabel.trim()) {
                  setLocationLabel(next.locationLabel);
                } else if (next.locationLabel) {
                  setLocationLabel(next.locationLabel);
                }
                setLat(next.lat);
                setLng(next.lng);
              }}
            />
          </div>

          <div>
            <label htmlFor="cmp-desc" className="block text-xs font-medium text-slate-700 mb-1.5">
              Observed Hazard &amp; Operational Context
            </label>
            <textarea
              id="cmp-desc"
              required
              minLength={10}
              maxLength={2000}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe structural damage, safety hazards for pedestrians or vehicles, and duration..."
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 space-y-4">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold text-slate-900">
                Prioritization Assessment
              </span>
              <span className="text-xs font-mono tabular-nums text-slate-600">
                Projected: <strong className="text-slate-900">{livePriority.totalScore}/100</strong> ·{' '}
                <strong
                  className={
                    livePriority.tier === 'P1 Critical'
                      ? 'text-red-700'
                      : livePriority.tier === 'P2 High'
                        ? 'text-amber-700'
                        : 'text-blue-700'
                  }
                >
                  {livePriority.tier}
                </strong>{' '}
                ({livePriority.slaTargetHours}h SLA)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="cmp-severity" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Infrastructure Severity (1–5)
                </label>
                <select
                  id="cmp-severity"
                  value={severity}
                  onChange={(e) => setSeverity(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-700 tabular-nums"
                >
                  <option value={1}>1 — Minor cosmetic</option>
                  <option value={2}>2 — Localized wear</option>
                  <option value={3}>3 — Service disruption</option>
                  <option value={4}>4 — Major failure</option>
                  <option value={5}>5 — Critical outage</option>
                </select>
              </div>

              <div>
                <label htmlFor="cmp-safety" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Public Safety Risk (1–5)
                </label>
                <select
                  id="cmp-safety"
                  value={safetyImpact}
                  onChange={(e) => setSafetyImpact(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-700 tabular-nums"
                >
                  <option value={1}>1 — Negligible risk</option>
                  <option value={2}>2 — Low caution</option>
                  <option value={3}>3 — Moderate hazard</option>
                  <option value={4}>4 — High injury risk</option>
                  <option value={5}>5 — Immediate danger</option>
                </select>
              </div>

              <div>
                <label htmlFor="cmp-scope" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Affected Footprint
                </label>
                <select
                  id="cmp-scope"
                  value={affectedScope}
                  onChange={(e) => setAffectedScope(e.target.value as AffectedScope)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-700"
                >
                  {AFFECTED_SCOPES.map((sc) => (
                    <option key={sc} value={sc}>
                      {sc}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {!editingComplaint && (
            <div>
              <label htmlFor="cmp-evidence" className="block text-xs font-medium text-slate-700 mb-1.5">
                Field Inspection Photo (Optional Sample Reference)
              </label>
              <select
                id="cmp-evidence"
                value={evidenceImageUrl}
                onChange={(e) => setEvidenceImageUrl(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-700"
              >
                {EVIDENCE_PRESETS.map((preset) => (
                  <option key={preset.label} value={preset.url}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              {submitting
                ? 'Saving...'
                : editingComplaint
                  ? 'Save Changes'
                  : 'Submit Complaint'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
