import { useState, useEffect } from "react";

// --- Brand Tokens ---------------------------------------------------------------
const T = {
  navy: "#0B2545",
  navyMid: "#132D5E",
  navyLight: "#1A3A6E",
  blue: "#1C54F2",
  blueBright: "#2E6BFF",
  blueGlow: "#4B8BF5",
  teal: "#0891B2",
  purple: "#8B5CF6",
  success: "#059669",
  warning: "#F59E0B",
  danger: "#EF4444",
  cloud: "#F2F1EE",
  cloudLight: "#F9F8F6",
  cloudDark: "#E8E6E0",
  cream: "#FAF9F7",
  border: "#E2DFDA",
  muted: "#8A8780",
  ink: "#2C2A26",
} as const;

type Theme = "dark" | "light";

interface ThemeTokens {
  bg: string;
  surface: string;
  surfaceHover: string;
  border: string;
  borderAccent: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  cardShadow: string;
  glowBlue: string;
  chartLine: string;
  chartFill: string;
  insightBg: string;
  insightBorder: string;
  successBg: string;
  successBorder: string;
  pillBg: string;
  pillBorder: string;
}

const THEMES: Record<Theme, ThemeTokens> = {
  dark: {
    bg: T.navy,
    surface: "rgba(255,255,255,0.04)",
    surfaceHover: "rgba(255,255,255,0.07)",
    border: "rgba(255,255,255,0.07)",
    borderAccent: "rgba(255,255,255,0.12)",
    text: "#FFFFFF",
    textSecondary: "rgba(255,255,255,0.55)",
    textTertiary: "rgba(255,255,255,0.3)",
    cardShadow: "0 2px 20px rgba(0,0,0,0.3)",
    glowBlue: "rgba(28,84,242,0.12)",
    chartLine: T.blueGlow,
    chartFill: "rgba(75,139,245,0.08)",
    insightBg: "rgba(239,68,68,0.06)",
    insightBorder: "rgba(239,68,68,0.15)",
    successBg: "rgba(5,150,105,0.08)",
    successBorder: "rgba(5,150,105,0.15)",
    pillBg: "rgba(255,255,255,0.06)",
    pillBorder: "rgba(255,255,255,0.1)",
  },
  light: {
    bg: T.cloud,
    surface: "#FFFFFF",
    surfaceHover: T.cloudLight,
    border: T.border,
    borderAccent: T.cloudDark,
    text: T.ink,
    textSecondary: T.muted,
    textTertiary: "rgba(0,0,0,0.25)",
    cardShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.03)",
    glowBlue: "rgba(28,84,242,0.04)",
    chartLine: T.blue,
    chartFill: "rgba(28,84,242,0.04)",
    insightBg: "rgba(239,68,68,0.04)",
    insightBorder: "rgba(239,68,68,0.12)",
    successBg: "rgba(5,150,105,0.04)",
    successBorder: "rgba(5,150,105,0.12)",
    pillBg: "rgba(0,0,0,0.03)",
    pillBorder: "rgba(0,0,0,0.06)",
  },
};

// --- Monolith Mark (circular) ---------------------------------------------------
interface MonolithMarkProps {
  size?: number;
}

function MonolithMark({ size = 44 }: MonolithMarkProps) {
  const id = `m-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id={`${id}-c`} x1=".1" y1="0" x2=".85" y2="1">
          <stop offset="0%" stopColor="#2E6BFF" stopOpacity=".58" />
          <stop offset="100%" stopColor="#091D3E" stopOpacity=".72" />
        </linearGradient>
        <radialGradient id={`${id}-r`} cx="28%" cy="24%" r="60%">
          <stop offset="0%" stopColor="#6AABFF" stopOpacity=".42" />
          <stop offset="100%" stopColor="#1C54F2" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-t`} x1=".05" y1="1" x2=".35" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity=".55" />
          <stop offset="100%" stopColor="white" stopOpacity=".97" />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1=".1" y1="0" x2=".4" y2="1">
          <stop offset="0%" stopColor="#7ABBFF" stopOpacity=".65" />
          <stop offset="100%" stopColor="#1C54F2" stopOpacity=".06" />
        </linearGradient>
        <clipPath id={`${id}-p`}>
          <rect x="35" y="20" width="22" height="60" rx="5" />
        </clipPath>
        <clipPath id={`${id}-a`}>
          <polygon points="35,52 57,40 57,20 35,20" />
        </clipPath>
      </defs>
      <rect width="100" height="100" rx="50" fill={`url(#${id}-c)`} />
      <rect width="100" height="100" rx="50" fill={`url(#${id}-r)`} />
      <rect x="35" y="20" width="22" height="60" rx="5" fill="white" fillOpacity=".07" />
      <rect x="35" y="46" width="22" height="34" rx="5" fill="black" fillOpacity=".10" />
      <g clipPath={`url(#${id}-p)`}>
        <polyline points="32,80 46,72 60,80" stroke="white" strokeOpacity=".20" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <polyline points="32,72 46,64 60,72" stroke="white" strokeOpacity=".42" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <polyline points="32,64 46,56 60,64" stroke="white" strokeOpacity=".72" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
      <rect x="35" y="20" width="22" height="60" rx="5" fill={`url(#${id}-t)`} clipPath={`url(#${id}-a)`} />
      <line x1="33" y1="52" x2="59" y2="39" stroke="white" strokeWidth="1.2" strokeOpacity=".55" strokeLinecap="round" />
    </svg>
  );
}

// --- Sparkline SVG --------------------------------------------------------------
interface SparklineProps {
  data: number[];
  color: string;
  width?: number;
  height?: number;
  fill?: boolean;
}

function Sparkline({ data, color, width = 80, height = 28, fill = false }: SparklineProps) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });
  const lastPt = pts[pts.length - 1].split(",");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      {fill && (
        <polygon
          points={`0,${height} ${pts.join(" ")} ${width},${height}`}
          fill={color}
          fillOpacity="0.08"
        />
      )}
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastPt[0]} cy={lastPt[1]} r="3" fill={color} />
    </svg>
  );
}

// --- Module Status Pill ---------------------------------------------------------
interface ModuleCardProps {
  name: string;
  color: string;
  stat: string;
  theme: Theme;
  delay: number;
}

function ModuleCard({ name, color, stat, theme, delay }: ModuleCardProps) {
  const th = THEMES[theme];
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVis(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        padding: "10px 12px",
        borderRadius: 12,
        backgroundColor: th.surface,
        border: `1px solid ${th.border}`,
        position: "relative",
        overflow: "hidden",
        opacity: vis ? 1 : 0,
        transform: vis ? "translateY(0)" : "translateY(10px)",
        transition: "all 0.5s cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -20,
          left: -20,
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${color}18, transparent 70%)`,
          pointerEvents: "none",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: color }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: T.success, textTransform: "uppercase", letterSpacing: "0.06em" }}>Active</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: th.text, marginBottom: 1 }}>{name}</div>
      <div style={{ fontSize: 11, color: th.textSecondary }}>{stat}</div>
    </div>
  );
}

// --- KPI Card -------------------------------------------------------------------
type KPIStatus = "green" | "red" | "grey";

interface KPICardProps {
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  deltaDir?: "up" | "down";
  status: KPIStatus;
  sparkData?: number[];
  theme: Theme;
  delay: number;
  subtext?: string;
}

function KPICard({ label, value, unit, delta, deltaDir, status, sparkData, theme, delay, subtext }: KPICardProps) {
  const th = THEMES[theme];
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVis(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  const statusColor = status === "green" ? T.success : status === "red" ? T.danger : T.muted;

  return (
    <div
      style={{
        padding: "14px 16px 12px",
        borderRadius: 14,
        backgroundColor: th.surface,
        border: `1px solid ${th.border}`,
        boxShadow: th.cardShadow,
        position: "relative",
        overflow: "hidden",
        opacity: vis ? 1 : 0,
        transform: vis ? "translateY(0)" : "translateY(12px)",
        transition: "all 0.55s cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: th.textTertiary }}>{label}</span>
        <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: statusColor, flexShrink: 0, marginTop: 2 }} />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: th.text, lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: 13, color: th.textSecondary, fontWeight: 500 }}>{unit}</span>}
        {delta && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              marginLeft: 4,
              color: deltaDir === "up" ? T.success : T.danger,
            }}
          >
            {deltaDir === "up" ? "\u25B2" : "\u25BC"} {delta}
          </span>
        )}
      </div>
      {subtext && <div style={{ fontSize: 11, color: th.textSecondary, marginBottom: 6 }}>{subtext}</div>}
      {sparkData && (
        <div style={{ marginTop: 6 }}>
          <Sparkline data={sparkData} color={th.chartLine} width={100} height={24} fill />
        </div>
      )}
    </div>
  );
}

// --- Toast Notification ---------------------------------------------------------
interface ToastProps {
  icon: string;
  text: string;
  color?: string;
  theme: Theme;
  delay: number;
}

function Toast({ icon, text, color, theme, delay }: ToastProps) {
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVis(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 14px 7px 10px",
        borderRadius: 50,
        backgroundColor: theme === "dark" ? "rgba(255,255,255,0.95)" : "#FFFFFF",
        boxShadow: "0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)",
        fontSize: 11,
        fontWeight: 600,
        color: color || T.ink,
        opacity: vis ? 1 : 0,
        transform: vis ? "translateY(0) scale(1)" : "translateY(-8px) scale(0.96)",
        transition: "all 0.5s cubic-bezier(0.16,1,0.3,1)",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: 13 }}>{icon}</span>
      {text}
    </div>
  );
}

// --- Main Component -------------------------------------------------------------
interface DashboardShowcaseProps {
  theme?: Theme;
}

export default function DashboardShowcase({ theme = "dark" }: DashboardShowcaseProps) {
  const [loaded, setLoaded] = useState(false);
  const th = THEMES[theme];

  useEffect(() => {
    setLoaded(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setLoaded(true)));
  }, [theme]);

  return (
    <>
      <style>{`
        .stryde-dash * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes float-toast {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>

      <div className="stryde-dash" style={{ fontFamily: "'Outfit', sans-serif", width: "100%", maxWidth: 460, margin: "0 auto" }}>
        {/* --- Dashboard Frame --- */}
        <div
          style={{
            position: "relative",
            backgroundColor: th.bg,
            borderRadius: 20,
            padding: "24px 20px 20px",
            border: `1px solid ${th.borderAccent}`,
            boxShadow:
              theme === "dark"
                ? "0 8px 60px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)"
                : "0 8px 60px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
            overflow: "hidden",
            transition: "background-color 0.5s ease, border-color 0.5s ease, box-shadow 0.5s ease",
          }}
        >
          {/* Ambient glow */}
          <div
            style={{
              position: "absolute",
              top: -80,
              right: -60,
              width: 300,
              height: 300,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${T.blue}${theme === "dark" ? "14" : "08"}, transparent 70%)`,
              pointerEvents: "none",
              transition: "opacity 0.5s ease",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: -60,
              left: -40,
              width: 250,
              height: 250,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${T.teal}${theme === "dark" ? "0C" : "06"}, transparent 70%)`,
              pointerEvents: "none",
            }}
          />

          {/* --- Floating toasts --- */}
          <div
            style={{
              position: "absolute",
              top: -18,
              right: 20,
              zIndex: 10,
              animation: "float-toast 4s ease-in-out infinite",
            }}
          >
            <Toast icon="\uD83D\uDCDE" text="Call answered automatically" color={T.success} theme={theme} delay={800} />
          </div>
          <div
            style={{
              position: "absolute",
              bottom: -18,
              left: 20,
              zIndex: 10,
              animation: "float-toast 4s ease-in-out 1s infinite",
            }}
          >
            <Toast icon="\uD83D\uDCAC" text="Re-booking prompt sent" color={T.blue} theme={theme} delay={1200} />
          </div>

          {/* --- Header --- */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              marginBottom: 18,
              position: "relative",
              opacity: loaded ? 1 : 0,
              transform: loaded ? "translateY(0)" : "translateY(8px)",
              transition: "all 0.4s cubic-bezier(0.16,1,0.3,1)",
            }}
          >
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: th.textTertiary, marginBottom: 6 }}>
                Spires Physiotherapy &middot; London
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <MonolithMark size={22} />
                <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, fontWeight: 400, color: th.text, lineHeight: 1 }}>
                  Stryde<span style={{ color: T.blueGlow }}>OS</span> Dashboard
                </h1>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "6px 14px 6px 10px",
                borderRadius: 50,
                border: "1px solid rgba(5,150,105,0.2)",
                backgroundColor: "rgba(5,150,105,0.06)",
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: T.success }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: T.success }}>Live</span>
            </div>
          </div>

          {/* --- Module Row --- */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <ModuleCard name="Ava" color={T.blue} stat="12 today" theme={theme} delay={200} />
            <ModuleCard name="Pulse" color={T.teal} stat="8 follow-ups" theme={theme} delay={300} />
            <ModuleCard name="Intelligence" color={T.purple} stat="91% util." theme={theme} delay={400} />
          </div>

          {/* --- KPI Grid 2x2 --- */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
            <KPICard label="Follow-up Rate" value="3.3" unit="sessions/patient" delta="+2%" deltaDir="up" status="green" sparkData={[2.8, 2.9, 3.0, 3.1, 3.0, 3.2, 3.3]} theme={theme} delay={450} />
            <KPICard label="HEP Compliance" value="87%" delta="+1%" deltaDir="up" status="green" sparkData={[80, 82, 83, 84, 85, 86, 87]} theme={theme} delay={520} />
            <KPICard label="Utilisation" value="74%" delta="+1%" deltaDir="up" status="red" subtext="Room to add more bookings" sparkData={[70, 71, 72, 71, 73, 73, 74]} theme={theme} delay={590} />
            <KPICard label="DNA Rate" value="3%" delta="-25%" deltaDir="up" status="green" subtext="Low no-show rate" sparkData={[6, 5.5, 5, 4.2, 3.8, 3.2, 3]} theme={theme} delay={660} />
          </div>

          {/* --- Revenue + Appointments row --- */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 0 }}>
            <KPICard label="Appointments" value="73" unit="this week" delta="+4%" deltaDir="up" status="green" sparkData={[60, 62, 65, 68, 70, 71, 73]} theme={theme} delay={700} />
            <KPICard label="Revenue / Session" value="\u00A379" unit="avg" delta="+0%" deltaDir="up" status="grey" sparkData={[78, 78, 79, 79, 78, 79, 79]} theme={theme} delay={740} />
          </div>

          {/* --- Footer watermark --- */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingTop: 14,
              opacity: loaded ? 0.3 : 0,
              transition: "opacity 0.5s ease 1.2s",
            }}
          >
            <MonolithMark size={12} />
            <span style={{ fontSize: 10, fontWeight: 600, color: th.textTertiary, letterSpacing: "0.03em" }}>
              Stryde<span style={{ color: T.blueGlow }}>OS</span>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
