"use client";

interface TargetsCardProps {
  followUpTarget: string;
  setFollowUpTarget: (v: string) => void;
  hepTarget: string;
  setHepTarget: (v: string) => void;
  utilisationTarget: string;
  setUtilisationTarget: (v: string) => void;
  /** When true, UK private practice benchmark ranges are shown below each input. */
  showBenchmarks?: boolean;
}

function BenchmarkHint({ text }: { text: string }) {
  return (
    <p className="text-[11px] text-muted mt-1.5">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue/30 mr-1 relative top-[-1px]" />
      {text}
    </p>
  );
}

export default function TargetsCard({
  followUpTarget,
  setFollowUpTarget,
  hepTarget,
  setHepTarget,
  utilisationTarget,
  setUtilisationTarget,
  showBenchmarks = true,
}: TargetsCardProps) {
  return (
    <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
      <h3 className="font-display text-lg text-navy mb-1">KPI Targets</h3>
      {showBenchmarks && (
        <p className="text-[11px] text-muted mb-4">
          UK ranges shown from private practice dataset (715 clinics)
        </p>
      )}

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
          {showBenchmarks && <BenchmarkHint text="UK range: 4.0 (median) \u2014 5.5 (top quartile 6+)" />}
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
          {showBenchmarks && <BenchmarkHint text="UK range: 70\u201385% typical; >85% excellent" />}
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
          {showBenchmarks && <BenchmarkHint text="UK avg: ~72%; >80% monitor clinician wellbeing" />}
        </div>
      </div>

    </div>
  );
}
