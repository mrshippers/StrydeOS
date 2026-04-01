/** Skeleton for onboarding wizard — step indicator + form. */

const pulse = "animate-pulse bg-cloud-light dark:bg-white/5 rounded-lg";

export default function OnboardingLoading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: "#FAF9F7" }}>
      {/* Logo */}
      <div className={`${pulse} h-9 w-36 mb-8`} />

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`${pulse} h-8 w-8 rounded-full`} />
            {i < 4 && <div className={`${pulse} h-0.5 w-8`} />}
          </div>
        ))}
      </div>

      {/* Form card */}
      <div className="w-full max-w-lg rounded-2xl bg-white border border-border shadow-[var(--shadow-card)] p-8">
        <div className={`${pulse} h-7 w-56 mb-2`} />
        <div className={`${pulse} h-4 w-72 mb-8`} />

        {/* Form fields */}
        <div className="space-y-5">
          <div>
            <div className={`${pulse} h-3 w-20 mb-2`} />
            <div className={`${pulse} h-11 w-full rounded-xl`} />
          </div>
          <div>
            <div className={`${pulse} h-3 w-24 mb-2`} />
            <div className={`${pulse} h-11 w-full rounded-xl`} />
          </div>
          <div>
            <div className={`${pulse} h-3 w-16 mb-2`} />
            <div className={`${pulse} h-11 w-full rounded-xl`} />
          </div>
        </div>

        {/* CTA */}
        <div className={`${pulse} h-12 w-full rounded-xl mt-8`} />
      </div>
    </div>
  );
}
