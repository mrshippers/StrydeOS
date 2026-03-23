"use client";
import { brand } from "@/lib/brand";
import RouteErrorFallback from "@/components/ui/RouteErrorFallback";
export default function PulseError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorFallback error={error} reset={reset} moduleName="Pulse" accentColor={brand.teal} />;
}
