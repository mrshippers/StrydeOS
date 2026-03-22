"use client";

import { useAuth } from "@/hooks/useAuth";

export default function DemoBanner() {
  const { user } = useAuth();
  if (user?.uid !== "demo") return null;

  return (
    <div className="flex justify-center mb-5">
      <div
        className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full text-[13px] font-semibold tracking-wide"
        style={{
          color: "white",
          background: "rgba(108,196,232,0.12)",
          border: "1px solid rgba(108,196,232,0.25)",
          boxShadow: "0 0 30px rgba(108,196,232,0.08)",
        }}
      >
        <span
          className="relative flex h-2.5 w-2.5"
        >
          <span
            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
            style={{ backgroundColor: "#6CC4E8" }}
          />
          <span
            className="relative inline-flex rounded-full h-2.5 w-2.5"
            style={{ backgroundColor: "#6CC4E8" }}
          />
        </span>
        Demo
      </div>
    </div>
  );
}
