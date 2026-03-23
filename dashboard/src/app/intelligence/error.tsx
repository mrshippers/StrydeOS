"use client";
import { brand } from "@/lib/brand";
import RouteErrorFallback from "@/components/ui/RouteErrorFallback";
export default function IntelligenceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorFallback error={error} reset={reset} moduleName="Intelligence" accentColor={brand.purple} />;
}
