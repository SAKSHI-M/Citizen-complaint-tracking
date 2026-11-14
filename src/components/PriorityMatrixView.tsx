import React, { useState } from 'react';
import { AFFECTED_SCOPES, type AffectedScope, type Complaint } from '../types/civic';
import { calculatePriority } from '../utils/priorityEngine';

interface PriorityMatrixViewProps {
  complaints: Complaint[];
  onSelectComplaint: (complaint: Complaint) => void;
}

export const PriorityMatrixView: React.FC<PriorityMatrixViewProps> = ({
  complaints,
  onSelectComplaint,
}) => {
  const [simSeverity, setSimSeverity] = useState(4);
  const [simSafety, setSimSafety] = useState(4);
  const [simScope, setSimScope] = useState<AffectedScope>('Neighborhood');
  const [simCorrob, setSimCorrob] = useState(8);

  const simResult = calculatePriority(simSeverity, simSafety, simScope, simCorrob);

  const tierDistribution = [
    {
      tier: 'P1 Critical',
      threshold: '80 – 100 pts',
      sla: '4 hours',
      count: complaints.filter((c) => c.priorityTier === 'P1 Critical' && c.status !== 'Closed').length,
      colorClass: 'text-red-700',
    },
    {
      tier: 'P2 High',
      threshold: '60 – 79.9 pts',
      sla: '12 hours',
      count: complaints.filter((c) => c.priorityTier === 'P2 High' && c.status !== 'Closed').length,
      colorClass: 'text-amber-700',
    },
    {
      tier: 'P3 Moderate',
      threshold: '38 – 59.9 pts',
      sla: '48 hours',
      count: complaints.filter((c) => c.priorityTier === 'P3 Moderate' && c.status !== 'Closed').length,
      colorClass: 'text-blue-700',
    },
    {
      tier: 'P4 Routine',
      threshold: '0 – 37.9 pts',
      sla: '120 hours',
      count: complaints.filter((c) => c.priorityTier === 'P4 Routine' && c.status !== 'Closed').length,
      colorClass: 'text-slate-700',
    },
  ];

  const topRanked = [...complaints]
    .filter((c) => c.status !== 'Resolved' && c.status !== 'Closed')
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 6);

  return (
    <div className="space-y-8">
      {/* Scoring Governance Formula */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Weighted Prioritization Model &amp; SLA Tiers
          </h2>
          <p className="text-xs text-slate-600 mt-1 max-w-3xl leading-relaxed">
            CivicTrack computes a deterministic 0–100 priority index for every complaint using four auditable factors. Community corroborations boost visibility logarithmically so high-density neighborhoods cannot drown out single-report life-safety hazards.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-2 border-t border-slate-200">
          <div>
            <div className="text-xs text-slate-500">Infrastructure Severity</div>
            <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
              35%
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Physical asset failure scale from 1 (cosmetic) to 5 (critical outage).
            </p>
          </div>
          <div>
            <div className="text-xs text-slate-500">Public Safety Risk</div>
            <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
              30%
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Direct hazard to pedestrians, cyclists, commuters, or utilities.
            </p>
          </div>
          <div>
            <div className="text-xs text-slate-500">Affected Footprint</div>
            <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
              20%
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Isolated Spot (25), Block Level (50), Neighborhood (75), Major Corridor (100).
            </p>
          </div>
          <div>
            <div className="text-xs text-slate-500">Citizen Corroboration</div>
            <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
              15%
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Logarithmic curve reaching full 15-point weight at 25 verified confirmations.
            </p>
          </div>
        </div>
      </section>

      {/* Tier Thresholds + Interactive Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">SLA Escalation Matrix</h3>
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="py-2.5 px-4">Tier</th>
                <th className="py-2.5 px-4">Score Band</th>
                <th className="py-2.5 px-4">Response SLA</th>
                <th className="py-2.5 px-4 text-right">Active Queue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {tierDistribution.map((row) => (
                <tr key={row.tier} className="hover:bg-slate-50">
                  <td className={`py-3 px-4 font-semibold ${row.colorClass}`}>{row.tier}</td>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-700">{row.threshold}</td>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-700">{row.sla}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                    {row.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* What-If Simulator */}
        <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div className="flex items-baseline justify-between gap-4 border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Priority Score Simulator</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Test how field severity and citizen corroboration shift SLA urgency.
              </p>
            </div>
            <div className="text-right">
              <div className="text-xl font-semibold font-mono tabular-nums text-slate-900">
                {simResult.totalScore}/100
              </div>
              <div className="text-xs font-medium text-blue-700">
                {simResult.tier} · {simResult.slaTargetHours}h SLA
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="flex justify-between font-medium text-slate-700 mb-1">
                <span>Severity</span>
                <span className="font-mono tabular-nums">{simSeverity}/5 (+{simResult.severityPoints})</span>
              </label>
              <input
                type="range"
                min={1}
                max={5}
                value={simSeverity}
                onChange={(e) => setSimSeverity(Number(e.target.value))}
                className="w-full accent-blue-700"
              />
            </div>

            <div>
              <label className="flex justify-between font-medium text-slate-700 mb-1">
                <span>Safety Risk</span>
                <span className="font-mono tabular-nums">{simSafety}/5 (+{simResult.safetyPoints})</span>
              </label>
              <input
                type="range"
                min={1}
                max={5}
                value={simSafety}
                onChange={(e) => setSimSafety(Number(e.target.value))}
                className="w-full accent-blue-700"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Affected Footprint (+{simResult.scopePoints})
              </label>
              <select
                value={simScope}
                onChange={(e) => setSimScope(e.target.value as AffectedScope)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
              >
                {AFFECTED_SCOPES.map((sc) => (
                  <option key={sc} value={sc}>
                    {sc}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="flex justify-between font-medium text-slate-700 mb-1">
                <span>Corroborations</span>
                <span className="font-mono tabular-nums">{simCorrob} (+{simResult.corroborationPoints})</span>
              </label>
              <input
                type="range"
                min={0}
                max={30}
                value={simCorrob}
                onChange={(e) => setSimCorrob(Number(e.target.value))}
                className="w-full accent-blue-700"
              />
            </div>
          </div>
        </section>
      </div>

      {/* Top Ranked Open Cases */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Highest-Priority Unresolved Complaints
          </h3>
          <span className="text-xs text-slate-500">Click any row to inspect or dispatch</span>
        </div>

        {topRanked.length === 0 ? (
          <div className="p-6 text-xs text-slate-500">
            No active unresolved complaints currently in the queue.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {topRanked.map((c) => {
              const bd = calculatePriority(
                c.severity,
                c.safetyImpact,
                c.affectedScope,
                c.corroborationCount
              );
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelectComplaint(c)}
                  className="w-full text-left px-6 py-3.5 hover:bg-slate-50 transition-colors flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                      <span className="font-semibold text-slate-900">{c.trackingCode}</span>
                      <span aria-hidden="true">·</span>
                      <span>{c.ward}</span>
                      <span aria-hidden="true">·</span>
                      <span>{c.status}</span>
                    </div>
                    <div className="text-sm font-medium text-slate-900 truncate mt-0.5">
                      {c.title}
                    </div>
                  </div>
                  <div className="flex items-center gap-6 shrink-0 text-xs font-mono tabular-nums">
                    <div className="text-right text-slate-500 hidden sm:block">
                      Sev +{bd.severityPoints} · Safe +{bd.safetyPoints} · Scope +{bd.scopePoints} · Votes +{bd.corroborationPoints}
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-slate-900">{c.priorityScore}/100</div>
                      <div
                        className={
                          c.priorityTier === 'P1 Critical'
                            ? 'text-red-700 font-medium'
                            : c.priorityTier === 'P2 High'
                              ? 'text-amber-700 font-medium'
                              : 'text-blue-700 font-medium'
                        }
                      >
                        {c.priorityTier}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
