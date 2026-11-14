import React, { useCallback, useEffect, useState } from 'react';
import {
  AdvancedMarker,
  Map as GoogleMap,
  Pin,
  useMap,
  useMapsLibrary,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps';
import { Crosshair, MapPin, Search } from 'lucide-react';
import { useAutocompleteSuggestions } from '../hooks/useAutocompleteSuggestions';

interface PlaceLocationPickerProps {
  mapsAvailable: boolean;
  locationLabel: string;
  lat?: number;
  lng?: number;
  onLocationChange: (next: { locationLabel?: string; lat: number; lng: number }) => void;
}

const DEFAULT_CENTER = { lat: 37.7749, lng: -122.4194 };

const MapCameraController: React.FC<{ target?: { lat: number; lng: number } }> = ({
  target,
}) => {
  const map = useMap('picker-map');

  useEffect(() => {
    if (map && target) {
      map.panTo(target);
      if ((map.getZoom() ?? 12) < 15) {
        map.setZoom(15);
      }
    }
  }, [map, target?.lat, target?.lng]);

  return null;
};

export const PlaceLocationPicker: React.FC<PlaceLocationPickerProps> = ({
  mapsAvailable,
  locationLabel,
  lat,
  lng,
  onLocationChange,
}) => {
  const placesLib = useMapsLibrary('places');
  const [searchText, setSearchText] = useState('');
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const { suggestions, isLoading, resetSession } = useAutocompleteSuggestions(
    mapsAvailable ? searchText : ''
  );

  const hasCoords = typeof lat === 'number' && typeof lng === 'number';
  const markerPos = hasCoords ? { lat: lat as number, lng: lng as number } : undefined;

  const handleSelectSuggestion = useCallback(
    async (suggestion: google.maps.places.AutocompleteSuggestion) => {
      if (!placesLib || !suggestion.placePrediction) return;
      setGeoError(null);
      try {
        const place = suggestion.placePrediction.toPlace();
        await place.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location'],
        });
        resetSession();
        setSearchText('');

        const loc = place.location;
        if (loc) {
          const nextLat = typeof loc.lat === 'function' ? loc.lat() : Number(loc.lat);
          const nextLng = typeof loc.lng === 'function' ? loc.lng() : Number(loc.lng);
          const label =
            place.formattedAddress ||
            place.displayName ||
            suggestion.placePrediction.text.text;
          onLocationChange({
            locationLabel: label.slice(0, 140),
            lat: nextLat,
            lng: nextLng,
          });
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
        setGeoError('Unable to fetch place details for the selected result.');
      }
    },
    [placesLib, onLocationChange, resetSession]
  );

  const handleMapClick = useCallback(
    (ev: MapMouseEvent) => {
      const clicked = ev.detail?.latLng;
      if (!clicked) return;
      setGeoError(null);
      onLocationChange({
        lat: clicked.lat,
        lng: clicked.lng,
      });
    },
    [onLocationChange]
  );

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Browser geolocation is unavailable.');
      return;
    }
    setGeoBusy(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoBusy(false);
        onLocationChange({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        setGeoBusy(false);
        setGeoError('Location permission denied or unavailable.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  if (!mapsAvailable) {
    return (
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600">
        Interactive Google Maps location picker activates once `VITE_GOOGLE_MAPS_API_KEY` is loaded.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search street, intersection, or landmark via Google Places..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-700"
          />
          {(suggestions.length > 0 || isLoading) && (
            <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
              {isLoading && suggestions.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-500">Searching places...</div>
              ) : (
                suggestions.map((s, idx) => (
                  <button
                    key={s.placePrediction?.placeId || idx}
                    type="button"
                    onClick={() => void handleSelectSuggestion(s)}
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

        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={geoBusy}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap shrink-0"
        >
          <Crosshair className="w-3.5 h-3.5" />
          <span>{geoBusy ? 'Locating...' : 'Use My Location'}</span>
        </button>
      </div>

      {geoError && <p className="text-xs text-red-700">{geoError}</p>}

      <div className="w-full h-52 rounded-md overflow-hidden border border-slate-200 bg-slate-100">
        <GoogleMap
          id="picker-map"
          mapId="DEMO_MAP_ID"
          defaultCenter={markerPos || DEFAULT_CENTER}
          defaultZoom={markerPos ? 15 : 12}
          gestureHandling="greedy"
          disableDefaultUI={true}
          zoomControl={true}
          onClick={handleMapClick}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{ width: '100%', height: '100%' }}
        >
          <MapCameraController target={markerPos} />
          {markerPos && (
            <AdvancedMarker position={markerPos} title={locationLabel || 'Pinned hazard location'}>
              <Pin background="#1D4ED8" borderColor="#1E3A8A" glyphColor="#FFFFFF" />
            </AdvancedMarker>
          )}
        </GoogleMap>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Click anywhere on the map to refine the pin position.</span>
        {markerPos && (
          <span className="font-mono tabular-nums text-slate-700">
            {markerPos.lat.toFixed(5)}, {markerPos.lng.toFixed(5)}
          </span>
        )}
      </div>
    </div>
  );
};
