import React, { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useMap,
  useMapsLibrary,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps';
import { Crosshair, MapPin, Search } from 'lucide-react';
import { useAutocompleteSuggestions } from '../hooks/useAutocompleteSuggestions';
import { updateComplaintCoordinates } from '../services/civicService';
import type { Complaint } from '../types/civic';
import { formatSlaStatus } from '../utils/priorityEngine';

interface ComplaintMapViewProps {
  mapsAvailable: boolean;
  complaints: Complaint[];
  user: User;
  isAdmin: boolean;
  onSelectComplaint: (complaint: Complaint) => void;
}

const DEFAULT_CENTER = { lat: 37.7749, lng: -122.4194 };

function getPinPalette(complaint: Complaint): {
  background: string;
  borderColor: string;
  glyphColor: string;
} {
  if (complaint.status === 'Resolved' || complaint.status === 'Closed') {
    return { background: '#16A34A', borderColor: '#14532D', glyphColor: '#FFFFFF' };
  }
  switch (complaint.priorityTier) {
    case 'P1 Critical':
      return { background: '#DC2626', borderColor: '#7F1D1D', glyphColor: '#FFFFFF' };
    case 'P2 High':
      return { background: '#D97706', borderColor: '#78350F', glyphColor: '#FFFFFF' };
    case 'P3 Moderate':
      return { background: '#2563EB', borderColor: '#1E3A8A', glyphColor: '#FFFFFF' };
    default:
      return { background: '#475569', borderColor: '#1E293B', glyphColor: '#FFFFFF' };
  }
}

const MapViewportController: React.FC<{
  target: { lat: number; lng: number; zoom?: number } | null;
}> = ({ target }) => {
  const map = useMap('civic-incident-map');

  useEffect(() => {
    if (map && target) {
      map.panTo({ lat: target.lat, lng: target.lng });
      if (target.zoom) {
        map.setZoom(target.zoom);
      }
    }
  }, [map, target]);

  return null;
};

const ComplaintMarker: React.FC<{
  complaint: Complaint;
  isOpen: boolean;
  onMarkerClick: () => void;
  onCloseInfo: () => void;
  onInspectCase: () => void;
}> = ({ complaint, isOpen, onMarkerClick, onCloseInfo, onInspectCase }) => {
  const [markerRef, marker] = useAdvancedMarkerRef();

  if (typeof complaint.lat !== 'number' || typeof complaint.lng !== 'number') {
    return null;
  }

  const palette = getPinPalette(complaint);
  const createdMs = complaint.createdAt ? complaint.createdAt.toMillis() : null;
  const sla = formatSlaStatus(createdMs, complaint.slaTargetHours, complaint.status);

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: complaint.lat, lng: complaint.lng }}
        onClick={onMarkerClick}
        title={`${complaint.trackingCode} — ${complaint.title}`}
      >
        <Pin
          background={palette.background}
          borderColor={palette.borderColor}
          glyphColor={palette.glyphColor}
          scale={complaint.priorityTier === 'P1 Critical' ? 1.15 : 1}
        />
      </AdvancedMarker>

      {isOpen && marker && (
        <InfoWindow anchor={marker} onCloseClick={onCloseInfo} maxWidth={280}>
          <div className="p-1 space-y-2 text-slate-900">
            <div className="flex items-center justify-between gap-3 text-xs font-mono tabular-nums">
              <span className="font-semibold text-slate-900">{complaint.trackingCode}</span>
              <span className="font-semibold text-slate-700">
                {complaint.priorityScore}/100 · {complaint.priorityTier}
              </span>
            </div>
            <div className="text-xs font-semibold leading-snug text-slate-900">
              {complaint.title}
            </div>
            <div className="text-xs text-slate-600">
              {complaint.locationLabel} · {complaint.status}
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-xs">
              <span className="font-mono tabular-nums text-slate-600">{sla.label}</span>
              <button
                type="button"
                onClick={onInspectCase}
                className="font-medium text-blue-700 hover:underline"
              >
                Open Case
              </button>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

export const ComplaintMapView: React.FC<ComplaintMapViewProps> = ({
  mapsAvailable,
  complaints,
  user,
  isAdmin,
  onSelectComplaint,
}) => {
  const placesLib = useMapsLibrary('places');
  const [searchQuery, setSearchQuery] = useState('');
  const { suggestions, isLoading, resetSession } = useAutocompleteSuggestions(
    mapsAvailable ? searchQuery : ''
  );

  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
  const [pinningComplaint, setPinningComplaint] = useState<Complaint | null>(null);
  const [cameraTarget, setCameraTarget] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
  } | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [savingPin, setSavingPin] = useState(false);

  const pinnedComplaints = complaints.filter(
    (c) => typeof c.lat === 'number' && typeof c.lng === 'number'
  );
  const unpinnedComplaints = complaints.filter(
    (c) => typeof c.lat !== 'number' || typeof c.lng !== 'number'
  );

  const initialCenter =
    pinnedComplaints.length > 0
      ? { lat: pinnedComplaints[0].lat as number, lng: pinnedComplaints[0].lng as number }
      : DEFAULT_CENTER;

  const handleSelectPlace = useCallback(
    async (suggestion: google.maps.places.AutocompleteSuggestion) => {
      if (!placesLib || !suggestion.placePrediction) return;
      setMapError(null);
      try {
        const place = suggestion.placePrediction.toPlace();
        await place.fetchFields({ fields: ['location', 'formattedAddress', 'displayName'] });
        resetSession();
        setSearchQuery('');
        if (place.location) {
          const lat =
            typeof place.location.lat === 'function'
              ? place.location.lat()
              : Number(place.location.lat);
          const lng =
            typeof place.location.lng === 'function'
              ? place.location.lng()
              : Number(place.location.lng);
          setCameraTarget({ lat, lng, zoom: 14 });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('OVER_QUERY_LIMIT') ||
          msg.includes('429')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        setMapError('Unable to jump to that location.');
      }
    },
    [placesLib, resetSession]
  );

  const handleMapClick = useCallback(
    async (ev: MapMouseEvent) => {
      if (!pinningComplaint || !ev.detail?.latLng || savingPin) return;
      setSavingPin(true);
      setMapError(null);
      try {
        await updateComplaintCoordinates(
          pinningComplaint,
          ev.detail.latLng.lat,
          ev.detail.latLng.lng
        );
        setActiveMarkerId(pinningComplaint.id);
        setPinningComplaint(null);
      } catch {
        setMapError('Permission denied or unable to save pin coordinates.');
      } finally {
        setSavingPin(false);
      }
    },
    [pinningComplaint, savingPin]
  );

  const handleCenterOnMe = () => {
    if (!navigator.geolocation) {
      setMapError('Geolocation is not supported in this browser.');
      return;
    }
    setMapError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCameraTarget({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          zoom: 14,
        });
      },
      () => {
        setMapError('Unable to access your current location.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  if (!mapsAvailable) {
    return (
      <section className="bg-white border border-slate-200 rounded-lg p-8 text-center space-y-2">
        <MapPin className="w-7 h-7 text-slate-400 mx-auto" />
        <h2 className="text-sm font-semibold text-slate-900">
          Google Maps API Key Pending
        </h2>
        <p className="text-xs text-slate-600 max-w-md mx-auto">
          Configure `VITE_GOOGLE_MAPS_API_KEY` and restart the server to activate the live Incident Map and Places search.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {mapError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-800">
          {mapError}
        </div>
      )}

      {pinningComplaint && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-md flex items-center justify-between gap-4 text-xs text-blue-900">
          <span>
            Click on the map to pin <strong>{pinningComplaint.trackingCode}</strong> ({pinningComplaint.locationLabel}).
          </span>
          <button
            type="button"
            onClick={() => setPinningComplaint(null)}
            className="font-medium underline shrink-0"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Map Canvas */}
        <section className="lg:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="p-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Jump map to city, district, or street..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-700"
              />
              {(suggestions.length > 0 || isLoading) && (
                <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-md shadow-lg max-h-52 overflow-y-auto divide-y divide-slate-100">
                  {isLoading && suggestions.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-500">Searching...</div>
                  ) : (
                    suggestions.map((s, idx) => (
                      <button
                        key={s.placePrediction?.placeId || idx}
                        type="button"
                        onClick={() => void handleSelectPlace(s)}
                        className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-start gap-2"
                      >
                        <MapPin className="w-3.5 h-3.5 text-blue-700 shrink-0 mt-0.5" />
                        <span className="truncate">{s.placePrediction?.text.text}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={handleCenterOnMe}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span>My Area</span>
              </button>
              <span className="text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap">
                {pinnedComplaints.length} pinned
              </span>
            </div>
          </div>

          <div className="w-full h-[560px] bg-slate-100">
            <GoogleMap
              id="civic-incident-map"
              mapId="DEMO_MAP_ID"
              defaultCenter={initialCenter}
              defaultZoom={12}
              gestureHandling="greedy"
              onClick={handleMapClick}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
            >
              <MapViewportController target={cameraTarget} />
              {pinnedComplaints.map((c) => (
                <ComplaintMarker
                  key={c.id}
                  complaint={c}
                  isOpen={activeMarkerId === c.id}
                  onMarkerClick={() => setActiveMarkerId(c.id)}
                  onCloseInfo={() => setActiveMarkerId(null)}
                  onInspectCase={() => onSelectComplaint(c)}
                />
              ))}
            </GoogleMap>
          </div>

          <div className="px-4 py-2.5 border-t border-slate-200 flex flex-wrap items-center gap-4 text-xs text-slate-600">
            <span className="font-medium text-red-700">P1 Critical</span>
            <span className="font-medium text-amber-700">P2 High</span>
            <span className="font-medium text-blue-700">P3 Moderate</span>
            <span className="font-medium text-slate-700">P4 Routine</span>
            <span className="font-medium text-emerald-700">Resolved / Closed</span>
          </div>
        </section>

        {/* Pinned & Unpinned Complaint Rail */}
        <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Mapped &amp; Unmapped Cases</h2>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {complaints.length} total
            </span>
          </div>

          <div className="max-h-[590px] overflow-y-auto divide-y divide-slate-200">
            {complaints.length === 0 ? (
              <div className="p-6 text-xs text-slate-500">
                No complaints filed yet. Use File Complaint to pin a location on the map.
              </div>
            ) : (
              complaints.map((c) => {
                const isPinned = typeof c.lat === 'number' && typeof c.lng === 'number';
                const canPin =
                  isAdmin || (c.reporterId === user.uid && c.status === 'Submitted');

                return (
                  <div key={c.id} className="p-4 space-y-1.5 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between gap-2 text-xs font-mono tabular-nums">
                      <span className="font-semibold text-slate-900">{c.trackingCode}</span>
                      <span
                        className={
                          c.priorityTier === 'P1 Critical'
                            ? 'text-red-700 font-semibold'
                            : c.priorityTier === 'P2 High'
                              ? 'text-amber-700 font-semibold'
                              : 'text-blue-700 font-medium'
                        }
                      >
                        {c.priorityScore} · {c.priorityTier}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectComplaint(c)}
                      className="text-left text-xs font-semibold text-slate-900 hover:text-blue-700 block w-full truncate"
                    >
                      {c.title}
                    </button>

                    <div className="text-xs text-slate-500 truncate">{c.locationLabel}</div>

                    <div className="flex items-center justify-between pt-1 text-xs">
                      <span className="text-slate-600">{c.status}</span>
                      {isPinned ? (
                        <button
                          type="button"
                          onClick={() => {
                            setCameraTarget({
                              lat: c.lat as number,
                              lng: c.lng as number,
                              zoom: 16,
                            });
                            setActiveMarkerId(c.id);
                          }}
                          className="font-medium text-blue-700 hover:underline"
                        >
                          Focus Pin
                        </button>
                      ) : canPin ? (
                        <button
                          type="button"
                          onClick={() => setPinningComplaint(c)}
                          className="font-medium text-amber-700 hover:underline"
                        >
                          {pinningComplaint?.id === c.id ? 'Click Map...' : 'Pin on Map'}
                        </button>
                      ) : (
                        <span className="text-slate-400">No coordinates</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
