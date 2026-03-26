"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export default function ApiDocsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Clinicians cannot access API docs — owner/admin/superadmin only
  useEffect(() => {
    if (!loading && user && user.role === "clinician") {
      router.replace("/dashboard");
    }
  }, [loading, user, router]);

  if (loading || (user && user.role === "clinician")) return null;

  return (
    <iframe
      src="/api-docs.html"
      title="StrydeOS API Reference"
      className="fixed inset-0 w-full h-full border-0"
      style={{ zIndex: 50 }}
    />
  );
}
