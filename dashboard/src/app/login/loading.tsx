/** Skeleton for login page — centered auth form. */

const pulse = "animate-pulse bg-cloud-light dark:bg-white/5 rounded-lg";

export default function LoginLoading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: "#FAF9F7" }}>
      {/* Logo */}
      <div className={`${pulse} h-9 w-36 mb-8`} />

      {/* Auth card */}
      <div className="w-full max-w-md rounded-2xl bg-white border border-border shadow-[var(--shadow-card)] p-8">
        <div className={`${pulse} h-7 w-40 mb-2`} />
        <div className={`${pulse} h-4 w-56 mb-8`} />

        {/* Form fields */}
        <div className="space-y-4">
          <div>
            <div className={`${pulse} h-3 w-16 mb-2`} />
            <div className={`${pulse} h-11 w-full rounded-xl`} />
          </div>
          <div>
            <div className={`${pulse} h-3 w-20 mb-2`} />
            <div className={`${pulse} h-11 w-full rounded-xl`} />
          </div>
        </div>

        <div className={`${pulse} h-12 w-full rounded-xl mt-6`} />

        <div className="flex justify-center mt-4">
          <div className={`${pulse} h-3 w-32`} />
        </div>
      </div>
    </div>
  );
}
