import Link from "next/link";
import { MonolithMark } from "@/components/MonolithLogo";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-navy text-white px-6">
      <MonolithMark size={64} />
      <h1 className="font-display text-4xl mt-8 mb-3">Page not found</h1>
      <p className="text-white/50 text-sm max-w-sm text-center mb-8">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-semibold bg-blue text-white hover:opacity-90 transition-opacity"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
