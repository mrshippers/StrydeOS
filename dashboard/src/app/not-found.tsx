import Link from "next/link";
import { MonolithMark } from "@/components/MonolithLogo";
import { GlassCard } from "@/components/ui/GlassCard";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-navy text-white px-6">
      <GlassCard variant="primary" tint="neutral" className="max-w-md w-full">
        <div className="flex flex-col items-center text-center px-8 py-10">
          <MonolithMark size={48} />

          <p className="text-[80px] font-display text-white/10 leading-none mt-6 mb-2 select-none">
            404
          </p>

          <h1 className="font-display text-2xl mb-2">
            Nothing here
          </h1>
          <p className="text-white/40 text-sm max-w-sm text-center mb-8">
            This page doesn&apos;t exist — or it moved and forgot to leave a
            forwarding address. Head back to the dashboard.
          </p>

          <Link
            href="/dashboard"
            className="btn-primary"
          >
            Back to dashboard
          </Link>
        </div>
      </GlassCard>
    </div>
  );
}
