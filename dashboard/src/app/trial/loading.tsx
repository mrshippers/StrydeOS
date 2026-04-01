/** Skeleton for trial page — hero + module cards layout. */

const pulse = "animate-pulse bg-cloud-light dark:bg-white/5 rounded-lg";

export default function TrialLoading() {
  return (
    <div className="min-h-screen flex flex-col items-center p-6 pt-20" style={{ background: "#FAF9F7" }}>
      {/* Logo */}
      <div className={`${pulse} h-9 w-36 mb-10`} />

      {/* Hero */}
      <div className="text-center mb-10 w-full max-w-xl">
        <div className={`${pulse} h-10 w-80 mx-auto mb-3`} />
        <div className={`${pulse} h-5 w-96 mx-auto mb-2`} />
        <div className={`${pulse} h-5 w-72 mx-auto`} />
      </div>

      {/* Benefits row */}
      <div className="flex gap-6 mb-10">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`${pulse} h-5 w-5 rounded-full`} />
            <div className={`${pulse} h-4 w-28`} />
          </div>
        ))}
      </div>

      {/* Module cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-3xl">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-white border border-border shadow-[var(--shadow-card)] p-6">
            <div className={`${pulse} h-8 w-8 rounded-lg mb-4`} />
            <div className={`${pulse} h-5 w-24 mb-2`} />
            <div className={`${pulse} h-3 w-full mb-1`} />
            <div className={`${pulse} h-3 w-3/4 mb-4`} />
            <div className={`${pulse} h-10 w-full rounded-xl`} />
          </div>
        ))}
      </div>
    </div>
  );
}
