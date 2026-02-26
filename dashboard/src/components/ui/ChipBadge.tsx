"use client";

interface ChipBadgeProps {
  label: string;
  color?: string;
  variant?: "filled" | "outline";
}

export default function ChipBadge({
  label,
  color = "#6B7280",
  variant = "filled",
}: ChipBadgeProps) {
  if (variant === "outline") {
    return (
      <span
        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold border"
        style={{ color, borderColor: `${color}40` }}
      >
        {label}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
      style={{ backgroundColor: `${color}15`, color }}
    >
      {label}
    </span>
  );
}
