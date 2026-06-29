'use client';

import { useState, useMemo } from "react";

/* ── Brand Tokens (match site) ── */
const C = {
  cloudDancer: "#F2F1EE", cloudLight: "#F9F8F6", cream: "#FAF9F7",
  navy: "#0B2545", navyMid: "#132D5E", navyLight: "#1A3A6E",
  blue: "#1C54F2", blueBright: "#2E6BFF", blueGlow: "#4B8BF5", teal: "#0891B2",
  ink: "#111827", muted: "#6B7280", success: "#059669", border: "#E2DFDA",
};

const hexToRgba = (hex, a) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
};

/* ── Locked pricing (CLAUDE.md / ModulePricingBanner) ── */
const PRICING = {
  solo:   { ava: 99,  label: "Solo",   sub: "1" },
  studio: { ava: 149, label: "Studio", sub: "2–5" },
  clinic: { ava: 199, label: "Clinic", sub: "6+" },
};

/* ── Model assumptions (conservative, disclosed) ── */
const WEEKS_PER_MONTH = 4.33;
const AVA_RECOVERY = 0.85; // share of currently-missed calls Ava actually answers/recovers

const gbp = (n) => "£" + Math.round(n).toLocaleString("en-GB");

function Field({ label, hint, value, suffix, min, max, step, onChange }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <label style={{ fontFamily: "'Outfit',sans-serif", fontSize: 14, fontWeight: 600, color: C.ink }}>{label}</label>
        <span style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: C.navy, lineHeight: 1 }}>
          {suffix === "£" ? gbp(value) : `${value}${suffix || ""}`}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step || 1} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: C.blue, cursor: "pointer", height: 4 }}
      />
      {hint ? <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12, color: C.muted, marginTop: 6 }}>{hint}</div> : null}
    </div>
  );
}

export default function RoiCalculator() {
  const [calls, setCalls] = useState(40);        // inbound calls / week
  const [missedPct, setMissedPct] = useState(30); // % missed
  const [convPct, setConvPct] = useState(50);    // answered new enquiry -> booked patient
  const [value, setValue] = useState(260);       // avg patient value
  const [serviceSpend, setServiceSpend] = useState(0); // call-handling spend you'd cancel
  const [tier, setTier] = useState("studio");

  const r = useMemo(() => {
    const missedWk = calls * (missedPct / 100);
    const recoveredCallsWk = missedWk * AVA_RECOVERY;
    const recoveredPatientsWk = recoveredCallsWk * (convPct / 100);
    const recoveredPatientsMo = recoveredPatientsWk * WEEKS_PER_MONTH;
    const recoveredRevenueMo = recoveredPatientsMo * value;
    const avaCost = PRICING[tier].ava;
    const grossBenefit = recoveredRevenueMo + serviceSpend;
    const netGain = grossBenefit - avaCost;
    const roi = avaCost > 0 ? grossBenefit / avaCost : 0;
    const paybackDays = grossBenefit > 0 ? Math.max(1, Math.round(avaCost / (grossBenefit / 30))) : 0;
    return { recoveredPatientsMo, recoveredRevenueMo, avaCost, grossBenefit, netGain, roi, paybackDays };
  }, [calls, missedPct, convPct, value, serviceSpend, tier]);

  const checkout = `https://portal.strydeos.com/checkout?plan=ava-${tier}&billing=now`;

  return (
    <main style={{ background: C.cream, minHeight: "100vh", fontFamily: "'Outfit',sans-serif", color: C.ink }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "96px 24px 80px" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", color: C.blue, marginBottom: 16 }}>ROI CALCULATOR</div>
          <h1 style={{ fontFamily: "'DM Serif Display',serif", fontWeight: 400, fontSize: "clamp(34px,5vw,52px)", lineHeight: 1.08, color: C.navy, margin: "0 0 16px", letterSpacing: "-0.01em" }}>
            What are missed calls costing your clinic?
          </h1>
          <p style={{ fontSize: 17, color: C.muted, maxWidth: 560, margin: "0 auto", lineHeight: 1.5 }}>
            Every unanswered call is a new patient booking the next clinic on Google. Move the sliders to your numbers and see what Ava recovers.
          </p>
        </div>

        {/* Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 28, alignItems: "start" }} className="roi-grid">

          {/* Inputs */}
          <div style={{
            background: "white", borderRadius: 20, padding: "30px 30px 12px",
            border: `1px solid ${C.border}`, boxShadow: "0 6px 30px rgba(11,37,69,0.06)",
          }}>
            <Field label="Inbound calls a week" hint="New enquiries plus existing patients" value={calls} suffix="" min={5} max={200} onChange={setCalls} />
            <Field label="Calls you miss" hint="After hours, lunch, already on the line" value={missedPct} suffix="%" min={0} max={80} onChange={setMissedPct} />
            <Field label="Enquiries that convert" hint="Of answered new-patient calls, share that book in" value={convPct} suffix="%" min={10} max={90} onChange={setConvPct} />
            <Field label="Average patient value" hint="Lifetime value across their course of care" value={value} suffix="£" min={80} max={800} step={10} onChange={setValue} />
            <Field label="Answering service you'd cancel" hint="Monthly spend Ava replaces (set 0 if none)" value={serviceSpend} suffix="£" min={0} max={1000} step={10} onChange={setServiceSpend} />

            {/* Tier */}
            <div style={{ marginBottom: 22 }}>
              <label style={{ fontFamily: "'Outfit',sans-serif", fontSize: 14, fontWeight: 600, color: C.ink, display: "block", marginBottom: 10 }}>Clinic size</label>
              <div style={{ display: "inline-flex", padding: 4, borderRadius: 14, background: C.cloudDancer, border: `1px solid ${C.border}`, width: "100%" }}>
                {Object.entries(PRICING).map(([id, t]) => {
                  const active = tier === id;
                  return (
                    <button key={id} onClick={() => setTier(id)} style={{
                      flex: 1, padding: "9px 6px 7px", borderRadius: 10, border: "none", cursor: "pointer",
                      fontFamily: "'Outfit',sans-serif", transition: "all 0.25s ease",
                      background: active ? `linear-gradient(135deg,${C.blueBright},${C.blue})` : "transparent",
                      boxShadow: active ? `0 2px 10px ${hexToRgba(C.blue, 0.25)}` : "none",
                    }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: active ? 700 : 600, color: active ? "white" : C.ink }}>{t.label}</span>
                      <span style={{ display: "block", fontSize: 11, color: active ? "rgba(255,255,255,0.7)" : C.muted }}>{t.sub} clinicians</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Results */}
          <div style={{
            position: "relative", overflow: "hidden", borderRadius: 20, padding: "34px 32px 30px",
            background: `radial-gradient(ellipse 90% 60% at 50% 0%, ${hexToRgba(C.navyLight, 0.5)}, ${C.navy} 72%)`,
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 16px 50px rgba(11,37,69,0.28)",
          }}>
            <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 70% 10%, ${hexToRgba(C.blueGlow, 0.10)}, transparent 60%)`, pointerEvents: "none" }} />

            <div style={{ position: "relative" }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: hexToRgba(C.blueGlow, 0.9), marginBottom: 10 }}>RECOVERED EVERY MONTH</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                <span style={{ fontFamily: "'DM Serif Display',serif", fontSize: 28, color: "rgba(255,255,255,0.6)", position: "relative", top: -24 }}>{"£"}</span>
                <span style={{ fontFamily: "'DM Serif Display',serif", fontSize: "clamp(52px,8vw,76px)", color: "white", lineHeight: 1, letterSpacing: "-0.02em" }}>
                  {Math.round(r.recoveredRevenueMo).toLocaleString("en-GB")}
                </span>
              </div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginTop: 8 }}>
                {gbp(r.recoveredRevenueMo * 12)} a year {"·"} ~{Math.round(r.recoveredPatientsMo)} new patients you're currently losing
              </div>

              {/* Stat rows */}
              <div style={{ marginTop: 26, borderTop: "1px solid rgba(255,255,255,0.10)", paddingTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px 16px" }}>
                <Stat k="Ava costs" v={`${gbp(r.avaCost)}/mo`} />
                <Stat k="Net gain" v={`${gbp(r.netGain)}/mo`} accent={C.success} />
                <Stat k="Return on Ava" v={`${r.roi.toFixed(1)}×`} accent={C.blueGlow} />
                <Stat k="Pays for itself in" v={`${r.paybackDays} day${r.paybackDays === 1 ? "" : "s"}`} />
              </div>

              {/* CTAs */}
              <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 10 }}>
                <a href="https://portal.strydeos.com/trial" target="_blank" rel="noopener" style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "15px 28px", borderRadius: 50, textDecoration: "none",
                  fontFamily: "'Outfit',sans-serif", fontSize: 15, fontWeight: 700, color: "white",
                  background: `linear-gradient(135deg,${C.blueBright},${C.blue})`,
                  boxShadow: `0 4px 18px ${hexToRgba(C.blue, 0.35)}, inset 0 1px 0 rgba(255,255,255,0.15)`,
                }}>Start free trial <span style={{ fontSize: 17 }}>{"→"}</span></a>
                <a href={checkout} target="_blank" rel="noopener" style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "13px 28px", borderRadius: 50, textDecoration: "none",
                  fontFamily: "'Outfit',sans-serif", fontSize: 14, fontWeight: 600,
                  color: "rgba(255,255,255,0.75)", border: "1.5px solid rgba(255,255,255,0.16)", background: "transparent",
                }}>Set Ava up now <span style={{ fontSize: 15 }}>{"→"}</span></a>
              </div>
            </div>
          </div>
        </div>

        {/* Assumptions */}
        <p style={{ fontSize: 12.5, color: C.muted, textAlign: "center", maxWidth: 680, margin: "32px auto 0", lineHeight: 1.6 }}>
          Conservative model. Assumes Ava answers {Math.round(AVA_RECOVERY * 100)}% of the calls you currently miss (the rest hang up before any receptionist could pick up), at your own conversion rate. Figures are an estimate to size the opportunity, not a guarantee. No setup fee, no lock-in, cancel any time.
        </p>
      </div>

      <style>{`
        @media (max-width: 760px) {
          .roi-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}

function Stat({ k, v, accent }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>{k}</div>
      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 24, color: accent || "white", lineHeight: 1.1 }}>{v}</div>
    </div>
  );
}
