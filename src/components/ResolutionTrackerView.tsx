import React from 'react';
import type { Complaint, ComplaintStatus } from '../types/civic';
import { formatSlaStatus } from '../utils/priorityEngine';

interface ResolutionTrackerViewProps {
  complaints: Complaint[];
  onSelectComplaint: (complaint: Complaint) => void;
}

const STAGE_GROUPS: Array<{
  title: string;
  subtitle: string;
  statuses: ComplaintStatus[];
}> = [
  {
    title: 'Intake & Triage',
    subtitle: 'Awaiting assessment or crew assignment',
    statuses: ['Submitted', 'Triaged'],
  },
  {
    title: 'Dispatched & Active Fieldwork',
    subtitle: 'Assigned to municipal crews on site',
    statuses: ['Dispatched', 'In Progress'],
  },
  {
    title: 'Resolved & Verified Closed',
    subtitle: 'Completed work orders and audit sign-off',
    statuses: ['Resolved', 'Closed'],
  },
];

export const ResolutionTrackerView: React.FC<ResolutionTrackerViewProps> = ({
  complaints,
  onSelectComplaint,
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      {STAGE_GROUPS.map((group) => {
        const items = complaints
          .filter((c) => group.statuses.includes(c.status))
          .sort((a, b) => b.priorityScore - a.priorityScore);

        return (
          <section
            key={group.title}
            className="bg-white border border-slate-200 rounded-lg overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{group.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{group.subtitle}</p>
              </div>
              <span className="text-sm font-mono tabular-nums font-semibold text-slate-900">
                {items.length}
              </span>
            </div>

            {items.length === 0 ? (
              <div className="p-6 text-xs text-slate-500">
                No complaints currently in this stage.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {items.map((c) => {
                  const createdMs = c.createdAt ? c.createdAt.toMillis() : null;
                  const sla = formatSlaStatus(createdMs, c.slaTargetHours, c.status);

                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onSelectComplaint(c)}
                      className="w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors space-y-1.5"
                    >
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

                      <div className="text-sm font-medium text-slate-900 leading-snug">
                        {c.title}
                      </div>

                      <div className="text-xs text-slate-500 truncate">
                        {c.locationLabel} · {c.ward}
                      </div>

                      <div className="flex items-center justify-between pt-1 text-xs">
                        <span className="text-slate-700 font-medium">
                          {c.status} · {c.assignedDepartment}
                        </span>
                        <span
                          className={`font-mono tabular-nums ${
                            sla.isOverdue
                              ? 'text-red-700 font-semibold'
                              : sla.isWarning
                                ? 'text-amber-700 font-medium'
                                : 'text-slate-500'
                          }`}
                        >
                          {sla.label}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};
