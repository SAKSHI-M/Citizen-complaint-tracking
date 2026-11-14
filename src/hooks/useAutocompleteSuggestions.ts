// Source: Google Maps Platform Code Assist (adapted from gmp-framework-react example_autocomplete)
import { useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

export interface UseAutocompleteSuggestionsReturn {
  suggestions: google.maps.places.AutocompleteSuggestion[];
  isLoading: boolean;
  resetSession: () => void;
}

export function useAutocompleteSuggestions(
  inputString: string,
  requestOptions: Partial<google.maps.places.AutocompleteRequest> = {}
): UseAutocompleteSuggestionsReturn {
  const placesLib = useMapsLibrary('places');
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!placesLib) return;

    const trimmed = inputString.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new AutocompleteSessionToken();
    }

    let cancelled = false;
    setIsLoading(true);

    const request: google.maps.places.AutocompleteRequest = {
      ...requestOptions,
      input: trimmed,
      sessionToken: sessionTokenRef.current,
    };

    const timer = setTimeout(() => {
      AutocompleteSuggestion.fetchAutocompleteSuggestions(request)
        .then((res) => {
          if (cancelled) return;
          setSuggestions(res?.suggestions ?? []);
          setIsLoading(false);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setSuggestions([]);
          setIsLoading(false);
          const msg = err instanceof Error ? err.message : String(err);
          if (
            msg.includes('RESOURCE_EXHAUSTED') ||
            msg.includes('OVER_QUERY_LIMIT') ||
            msg.includes('429')
          ) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          }
        });
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [placesLib, inputString]);

  return {
    suggestions,
    isLoading,
    resetSession: () => {
      sessionTokenRef.current = null;
      setSuggestions([]);
    },
  };
}
