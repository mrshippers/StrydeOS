"use client";

interface TargetsCardProps {
  followUpTarget: string;
  setFollowUpTarget: (v: string) => void;
  hepTarget: string;
  setHepTarget: (v: string) => void;
  utilisationTarget: string;
  setUtilisationTarget: (v: string) => void;
}

export default function TargetsCard({
  followUpTarget,
  setFollowUpTarget,
  hepTarget,
  setHepTarget,
  utilisationTarget,
  setUtilisationTarget,
}: TargetsCardProps) {
  return (
    <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
      <h3 className="font-display text-lg text-navy mb-4">KPI Targets</h3>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
            Follow-Up Rate Target (sessions per patient)
          </label>
          <input
            type="number"
            step="0.1"
            min="1"
            max="10"
            value={followUpTarget}
            onChange={(e) => setFollowUpTarget(e.target.value)}
            className="w-full px-3 py-2.5 rounded-[var(--radius-inner)] border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
            HEP Rate Target (%)
          </label>
          <input
            type="number"
            step="1"
            min="50"
            max="100"
            value={hepTarget}
            onChange={(e) => setHepTarget(e.target.value)}
            className="w-full px-3 py-2.5 rounded-[var(--radius-inner)] border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
            Utilisation Rate Target (%)
          </label>
          <input
            type="number"
            step="1"
            min="50"
            max="100"
            value={utilisationTarget}
            onChange={(e) => setUtilisationTarget(e.target.value)}
            className="w-full px-3 py-2.5 rounded-[var(--radius-inner)] border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
          />
        </div>
      </div>

    </div>
  );
}
