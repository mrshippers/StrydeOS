const IS_STAGING = process.env.NEXT_PUBLIC_APP_ENV === "staging";

export default function StagingBanner() {
  if (!IS_STAGING) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 py-1.5 text-[11px] font-semibold text-white uppercase tracking-wider"
      style={{ background: "#7C3AED" }}
    >
      <span className="opacity-70">⚗</span>
      Staging environment — same Firebase project, feature branch only
    </div>
  );
}
