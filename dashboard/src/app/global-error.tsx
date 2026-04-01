"use client";

/**
 * global-error.tsx — catches errors in the root layout itself.
 * Must render its own <html>/<body> because the root layout may have crashed.
 * Kept minimal — no brand imports, no external components — to avoid
 * the same dependency causing this error boundary to fail too.
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[StrydeOS] Root layout error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            'Outfit, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          background: "linear-gradient(180deg, #0B2545 0%, #091C38 100%)",
          color: "white",
          padding: "24px",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          {/* Inline SVG monolith mark — no external deps */}
          <svg
            width="48"
            height="48"
            viewBox="0 0 100 100"
            fill="none"
            style={{ marginBottom: 32 }}
          >
            <rect width="100" height="100" rx="24" fill="rgba(46,107,255,0.15)" />
            <rect
              x="35"
              y="20"
              width="22"
              height="60"
              rx="5"
              fill="rgba(255,255,255,0.7)"
            />
          </svg>

          <h2
            style={{
              fontFamily:
                '"DM Serif Display", Georgia, serif',
              fontSize: 22,
              fontWeight: 400,
              marginBottom: 8,
            }}
          >
            Something went wrong
          </h2>
          <p
            style={{
              fontSize: 14,
              opacity: 0.4,
              lineHeight: 1.6,
              marginBottom: 8,
            }}
          >
            StrydeOS hit an unexpected error loading the app. Your data is safe.
          </p>
          <p
            style={{
              fontSize: 13,
              opacity: 0.25,
              lineHeight: 1.6,
              marginBottom: 32,
            }}
          >
            Try again, or refresh the page.
          </p>

          {error.digest && (
            <p
              style={{
                fontSize: 10,
                opacity: 0.15,
                fontFamily: "monospace",
                marginBottom: 24,
                userSelect: "all",
              }}
            >
              ref: {error.digest}
            </p>
          )}

          <button
            onClick={reset}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 24px",
              borderRadius: 12,
              border: "none",
              fontSize: 14,
              fontWeight: 600,
              color: "white",
              background: "#1C54F2",
              boxShadow: "0 4px 20px rgba(28,84,242,0.4)",
              cursor: "pointer",
            }}
          >
            ↻ Try again
          </button>
        </div>
      </body>
    </html>
  );
}
