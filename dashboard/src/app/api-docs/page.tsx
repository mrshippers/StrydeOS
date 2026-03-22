import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "API Reference",
};

export default function ApiDocsPage() {
  return (
    <iframe
      src="/api-docs.html"
      title="StrydeOS API Reference"
      className="fixed inset-0 w-full h-full border-0"
      style={{ zIndex: 50 }}
    />
  );
}
