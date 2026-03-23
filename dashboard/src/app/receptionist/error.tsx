"use client";
import { brand } from "@/lib/brand";
import RouteErrorFallback from "@/components/ui/RouteErrorFallback";
export default function AvaError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorFallback error={error} reset={reset} moduleName="Ava" accentColor={brand.blue} />;
}
