/** Skeleton for checkout page — centered card layout. */

const pulse = "animate-pulse bg-cloud-light dark:bg-white/5 rounded-lg";

export default function CheckoutLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#FAF9F7" }}>
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className={`${pulse} h-9 w-36`} />
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white border border-border shadow-[var(--shadow-card)] p-8">
          {/* Title */}
          <div className={`${pulse} h-6 w-48 mb-2`} />
          <div className={`${pulse} h-4 w-64 mb-6`} />

          {/* Order summary */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`${pulse} h-8 w-8 rounded-lg`} />
                <div className={`${pulse} h-4 w-32`} />
              </div>
              <div className={`${pulse} h-4 w-16`} />
            </div>
            <div className="flex items-center justify-between">
              <div className={`${pulse} h-4 w-24`} />
              <div className={`${pulse} h-4 w-20`} />
            </div>
          </div>

          <div className="border-t border-border pt-4 mb-6">
            <div className="flex items-center justify-between">
              <div className={`${pulse} h-5 w-16`} />
              <div className={`${pulse} h-5 w-24`} />
            </div>
          </div>

          {/* CTA button */}
          <div className={`${pulse} h-12 w-full rounded-xl`} />

          {/* Trust badges */}
          <div className="flex justify-center gap-3 mt-4">
            <div className={`${pulse} h-5 w-20`} />
            <div className={`${pulse} h-5 w-20`} />
          </div>
        </div>
      </div>
    </div>
  );
}
