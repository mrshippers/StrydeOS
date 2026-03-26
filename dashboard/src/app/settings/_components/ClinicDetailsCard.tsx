"use client";

interface ClinicDetailsCardProps {
  clinicName: string;
  setClinicName: (v: string) => void;
  clinicAddress: string;
  setClinicAddress: (v: string) => void;
  clinicPhone: string;
  setClinicPhone: (v: string) => void;
  sessionPrice: string;
  setSessionPrice: (v: string) => void;
  clinicWebsite: string;
  setClinicWebsite: (v: string) => void;
  parkingInfo: string;
  setParkingInfo: (v: string) => void;
  timezone: string;
  setTimezone: (v: string) => void;
}

export default function ClinicDetailsCard({
  clinicName,
  setClinicName,
  clinicAddress,
  setClinicAddress,
  clinicPhone,
  setClinicPhone,
  sessionPrice,
  setSessionPrice,
  clinicWebsite,
  setClinicWebsite,
  parkingInfo,
  setParkingInfo,
  timezone,
  setTimezone,
}: ClinicDetailsCardProps) {
  return (
    <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
      <h3 className="font-display text-lg text-navy mb-4">Clinic Details</h3>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
            Clinic Name
          </label>
          <input
            type="text"
            value={clinicName}
            onChange={(e) => setClinicName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-[var(--radius-inner)] border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
            Address
          </label>
          <input
            type="text"
            value={clinicAddress}
            onChange={(e) => setClinicAddress(e.target.value)}
            placeholder="e.g. 123 High Street, West Hampstead, London NW6"
            className="w-full px-3 py-2.5 rounded-[var(--radius-inner)] border border-border bg-cloud-light text-sm text-navy placeholder:text-muted/50 focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
              Phone
            </label>
            <input
              type="tel"
              value={clinicPhone}
              onChange={(e) => setClinicPhone(e.target.value)}
              placeholder="020 7946 0958"
              className="w-full px-3 py-2.5 rounded-[var(--radius-inner)] border border-border bg-cloud-light text-sm text-navy placeholder:text-muted/50 focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
              Session Price (£)
            </label>
            <input
              type="number"
              step="0.50"
              min="0"
              value={sessionPrice}
              onChange={(e) => setSessionPrice(e.target.value)}
              placeholder="65.00"
              className="w-full px-3 py-2.5 rounded-[var(--radius-inner)] border border-border bg-cloud-light text-sm text-navy placeholder:text-muted/50 focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
            Website
          </label>
          <input
            type="url"
            value={clinicWebsite}
            onChange={(e) => setClinicWebsite(e.target.value)}
            placeholder="https://www.yourclinic.com"
            className="w-full px-3 py-2.5 rounded-[var(--radius-inner)] border border-border bg-cloud-light text-sm text-navy placeholder:text-muted/50 focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
            Parking Info
          </label>
          <textarea
            rows={2}
            value={parkingInfo}
            onChange={(e) => setParkingInfo(e.target.value)}
            placeholder="e.g. Free 2-hour parking on Mill Lane. Pay & display on West End Lane."
            className="w-full px-3 py-2.5 rounded-[var(--radius-inner)] border border-border bg-cloud-light text-sm text-navy placeholder:text-muted/50 focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors resize-none"
          />
          <p className="text-[10px] text-muted mt-1">Shared with Ava so she can answer parking questions</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
            Timezone
          </label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full px-3 py-2.5 rounded-[var(--radius-inner)] border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
          >
            <option value="Europe/London">Europe/London (GMT/BST)</option>
            <option value="Europe/Dublin">Europe/Dublin</option>
            <option value="America/New_York">US Eastern</option>
            <option value="Australia/Sydney">Australia/Sydney</option>
          </select>
        </div>
      </div>
    </div>
  );
}
