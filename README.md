# CivicTrack

Citizen complaint prioritization and municipal resolution tracking platform powered by React, TypeScript, Tailwind CSS, Firebase Authentication, Cloud Firestore, and Google Maps Platform.

## Overview

CivicTrack helps municipalities and residents triage public infrastructure complaints by verified risk rather than submission order:

- **Weighted Priority Scoring (0–100)**: Combines Infrastructure Severity (`35%`), Public Safety Risk (`30%`), Affected Geographic Footprint (`20%`), and logarithmic Citizen Corroborations (`15%`) into deterministic SLA tiers (`P1 Critical · 4h`, `P2 High · 12h`, `P3 Moderate · 48h`, `P4 Routine · 120h`).
- **Priority Queue**: Real-time ranked triage grid with search, segmented lifecycle filters, category/tier/ward filtering, SLA countdown indicators, and CSV export.
- **Incident Map (Google Maps Platform)**: Interactive map displaying priority-coded `AdvancedMarker` pins, anchored `InfoWindow` case previews, Places Autocomplete (`AutocompleteSuggestion`) location search, and click-to-pin coordinate assignment.
- **Resolution Tracker**: Stage-based view across `Intake & Triage`, `Dispatched & Active Fieldwork`, and `Resolved & Verified Closed`.
- **Atomic Citizen Corroboration**: Authenticated residents can verify active complaints once per account using batched Firestore writes that atomically increment `corroborationCount` and recalculate priority scores.
- **Role-Based Dispatch & Audit Ledger**: Municipal dispatchers can adjust severity/safety assessments, assign departments and field crews, advance lifecycle statuses, and log entries onto an append-only `/updates` resolution timeline.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons
- **Mapping & Places**: `@vis.gl/react-google-maps` (Maps JavaScript API, Advanced Markers, Places API New)
- **Backend / Database**: Firebase Authentication (Google Sign-In) & Cloud Firestore (`firebase-applet-config.json`)
- **Security**: Hardened `firestore.rules` validated with `@firebase/eslint-plugin-security-rules`

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   - Set `VITE_GOOGLE_MAPS_API_KEY` (see `.env.example`).
   - Ensure `firebase-applet-config.json` is configured for your Firebase project.

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Build & type-check**
   ```bash
   npm run lint
   npm run build
   ```

## Project Structure

- `src/CivicTrack.tsx` — Main workspace UI, queue filtering, KPI strip, and Firebase real-time subscriptions
- `src/components/ComplaintMapView.tsx` — Interactive Google Maps incident map with priority pins and Places search
- `src/components/PlaceLocationPicker.tsx` — Places Autocomplete (New) and click-to-pin coordinate picker
- `src/components/ComplaintModal.tsx` — Citizen complaint filing and edit modal with live priority projection
- `src/components/CaseDetailDrawer.tsx` — Case inspection, priority breakdown, corroboration, dispatcher controls, and audit timeline
- `src/components/ResolutionTrackerView.tsx` — Lifecycle stage board
- `src/components/PriorityMatrixView.tsx` — Scoring weights documentation and interactive score simulator
- `src/hooks/useAutocompleteSuggestions.ts` — Session-token-managed Places API (New) autocomplete hook
- `src/services/civicService.ts` — Firestore batch transactions and error handling
- `src/utils/priorityEngine.ts` — Deterministic priority scoring and SLA calculations
- `firebase-blueprint.json` & `firestore.rules` — Firestore schema blueprint and hardened security rules
