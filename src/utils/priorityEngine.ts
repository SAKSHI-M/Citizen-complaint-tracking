import type { AffectedScope, ComplaintCategory, PriorityTier } from '../types/civic';

export interface PriorityBreakdown {
  severityPoints: number;
  safetyPoints: number;
  scopePoints: number;
  corroborationPoints: number;
  totalScore: number;
  tier: PriorityTier;
  slaTargetHours: number;
}

const SCOPE_BASE: Record<AffectedScope, number> = {
  'Isolated Spot': 25,
  'Block Level': 50,
  'Neighborhood': 75,
  'Major Corridor': 100,
};

export function calculatePriority(
  severity: number,
  safetyImpact: number,
  affectedScope: AffectedScope,
  corroborationCount: number
): PriorityBreakdown {
  const clampedSev = Math.min(5, Math.max(1, Math.round(severity)));
  const clampedSafety = Math.min(5, Math.max(1, Math.round(safetyImpact)));
  const clampedCorrob = Math.max(0, Math.round(corroborationCount));

  // Weights: Severity 35%, Safety Impact 30%, Geographic Scope 20%, Citizen Corroboration 15%
  const severityPoints = Number((((clampedSev / 5) * 100) * 0.35).toFixed(1));
  const safetyPoints = Number((((clampedSafety / 5) * 100) * 0.30).toFixed(1));
  const scopePoints = Number(((SCOPE_BASE[affectedScope] ?? 25) * 0.20).toFixed(1));

  // Logarithmic community corroboration boost: 0 -> 0 pts, 5 -> 7.5 pts, 25+ -> 15 pts
  const corrobNormalized = Math.min(1, Math.log10(clampedCorrob + 1) / Math.log10(26));
  const corroborationPoints = Number((corrobNormalized * 100 * 0.15).toFixed(1));

  const totalScore = Math.min(
    100,
    Math.round((severityPoints + safetyPoints + scopePoints + corroborationPoints) * 10) / 10
  );

  let tier: PriorityTier = 'P4 Routine';
  let slaTargetHours = 120;

  if (totalScore >= 80) {
    tier = 'P1 Critical';
    slaTargetHours = 4;
  } else if (totalScore >= 60) {
    tier = 'P2 High';
    slaTargetHours = 12;
  } else if (totalScore >= 38) {
    tier = 'P3 Moderate';
    slaTargetHours = 48;
  }

  return {
    severityPoints,
    safetyPoints,
    scopePoints,
    corroborationPoints,
    totalScore,
    tier,
    slaTargetHours,
  };
}

export function getSuggestedDepartment(category: ComplaintCategory): string {
  switch (category) {
    case 'Water & Drainage':
      return 'Water & Sewer Ops';
    case 'Traffic & Signals':
      return 'Traffic Engineering';
    case 'Roadways & Potholes':
      return 'Public Works';
    case 'Street Lighting':
      return 'Electrical Grid';
    case 'Sanitation & Waste':
      return 'Sanitation Dept';
    case 'Public Parks & Trees':
      return 'Urban Forestry';
    default:
      return 'Public Works';
  }
}

export function formatSlaStatus(
  createdAtMs: number | null,
  slaTargetHours: number,
  status: string
): { label: string; isOverdue: boolean; isWarning: boolean; remainingHours: number } {
  if (status === 'Resolved' || status === 'Closed') {
    return { label: 'SLA Met / Closed', isOverdue: false, isWarning: false, remainingHours: 0 };
  }
  if (!createdAtMs) {
    return { label: `${slaTargetHours}h target`, isOverdue: false, isWarning: false, remainingHours: slaTargetHours };
  }

  const elapsedHours = (Date.now() - createdAtMs) / (1000 * 60 * 60);
  const remaining = slaTargetHours - elapsedHours;

  if (remaining <= 0) {
    const overdue = Math.abs(Math.round(remaining * 10) / 10);
    return {
      label: `Overdue ${overdue}h`,
      isOverdue: true,
      isWarning: false,
      remainingHours: remaining,
    };
  }

  const rounded = remaining >= 10 ? Math.round(remaining) : Math.round(remaining * 10) / 10;
  const isWarning = remaining <= slaTargetHours * 0.25 || remaining <= 2;

  return {
    label: `${rounded}h left`,
    isOverdue: false,
    isWarning,
    remainingHours: remaining,
  };
}

export function generateTrackingCode(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  const suffix = Math.random().toString(36).substring(2, 4).toUpperCase();
  return `CT-${num}${suffix}`;
}

export const SAMPLE_EVIDENCE_IMAGES = {
  waterMain: '/src/assets/images/evidence_water_main_1794629588770.jpg',
  trafficSignal: '/src/assets/images/evidence_traffic_signal_1794629590230.jpg',
  stormDrain: '/src/assets/images/evidence_storm_drain_1794629590331.jpg',
} as const;
