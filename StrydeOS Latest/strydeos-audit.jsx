import { useState, useEffect, useRef } from "react";

/* ───────────────────────────────────────────────────────────────────────────
   StrydeOS — Business Audit & Revenue Projections
   Internal founder dashboard · April 2026
   ─────────────────────────────────────────────────────────────────────────── */

const B = {
  blue: "#1C54F2", blueBright: "#2E6BFF", blueGlow: "#4B8BF5",
  navy: "#0B2545", navyMid: "#132D5E",
  teal: "#0891B2", purple: "#8B5CF6",
  success: "#059669", successBright: "#34D399",
  red: "#EF4444", amber: "#F59E0B",
  ink: "#111827", muted: "#6B7280",
  cloud: "#F2F1EE", cloudLight: "#F9F8F6", cream: "#FAF9F7",
  border: "#E2DFDA",
};

/* ── Revenue Model ────────────────────────────────────────────────────────── */
const STUDIO_PRICING = { Intelligence: 99, Ava: 149, Pulse: 99, FullStack: 299, setup: 199 };

function runProjection(scenario) {
  const configs = {
    conservative: {
      label: "Conservative",
      monthlyAdds: [0,1,1,1,1,1,1,2,2,2,2,2],
      churnRate: 0.06,
      arpc: 140,
      setupRate: 0.3,
      desc: "Jamal selling solo, word-of-mouth only, mostly Intelligence module"
    },
    realistic: {
      label: "Realistic",
      monthlyAdds: [1,1,2,2,3,3,3,4,4,4,5,5],
      churnRate: 0.04,
      arpc: 205,
      setupRate: 0.5,
      desc: "Eve + Sean activated Q2, outreach converting, Spires case study live"
    },
    optimistic: {
      label: "Optimistic",
      monthlyAdds: [2,2,3,4,4,5,5,6,6,7,7,8],
      churnRate: 0.03,
      arpc: 260,
      setupRate: 0.65,
      desc: "Outreach + referrals + HMDG intro + Cliniko listing all firing"
    },
  };

  const c = configs[scenario];
  let clinics = 0;
  const months = [];
  let totalRevenue = 0;
  let totalSetup = 0;

  for (let i = 0; i < 12; i++) {
    clinics = Math.max(0, Math.floor(clinics * (1 - c.churnRate)) + c.monthlyAdds[i]);
    const mrr = clinics * c.arpc;
    const setupFees = c.monthlyAdds[i] * c.setupRate * STUDIO_PRICING.setup;
    totalRevenue += mrr;
    totalSetup += setupFees;
    months.push({
      month: i + 1,
      label: ["May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr"][i],
      newClinics: c.monthlyAdds[i],
      totalClinics: clinics,
      mrr,
      setupFees,
      cumRevenue: totalRevenue + totalSetup,
    });
  }

  return {
    ...c,
    months,
    endMRR: months[11].mrr,
    endARR: months[11].mrr * 12,
    endClinics: months[11].totalClinics,
    totalCollected: totalRevenue + totalSetup,
  };
}

/* ── Components ───────────────────────────────────────────────────────────── */
const DotGrid = () => (
  <div style={{
    position: "absolute", inset: 0, opacity: 0.035, pointerEvents: "none",
    backgroundImage: "radial-gradient(circle, #111827 1px, transparent 1px)",
    backgroundSize: "24px 24px",
  }} />
);

const Badge = ({ children, color = B.blue, filled = false }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "4px 12px", borderRadius: 50, fontSize: 10, fontWeight: 700,
    letterSpacing: "0.08em", textTransform: "uppercase",
    color: filled ? "white" : color,
    background: filled ? color : `${color}12`,
    border: `1px solid ${filled ? color : `${color}30`}`,
  }}>{children}</span>
);

const MetricCard = ({ label, value, sub, color = B.ink, accent, pulse }) => (
  <div style={{
    padding: "28px 24px", borderRadius: 16,
    border: `1px solid ${B.border}`, background: "white",
    position: "relative", overflow: "hidden",
    transition: "transform 0.2s ease, box-shadow 0.2s ease",
  }}
    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 30px rgba(11,37,69,0.08)"; }}
    onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
  >
    {accent && <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:accent }} />}
    <div style={{ fontSize: 11, fontWeight: 600, color: B.muted, letterSpacing: "0.04em", marginBottom: 10, textTransform: "uppercase" }}>{label}</div>
    <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 36, color, lineHeight: 1, marginBottom: sub ? 6 : 0 }}>
      {pulse && <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%", background:color, marginRight:8, animation: "pulse 2s infinite" }} />}
      {value}
    </div>
    {sub && <div style={{ fontSize: 12, color: B.muted, lineHeight: 1.5 }}>{sub}</div>}
  </div>
);

const StatusRow = ({ label, status, detail }) => {
  const colors = { live: B.success, built: B.blue, partial: B.amber, blocked: B.red, planned: B.muted };
  const c = colors[status] || B.muted;
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 0", borderBottom:`1px solid ${B.border}` }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ width:8, height:8, borderRadius:"50%", background:c, flexShrink:0 }} />
        <span style={{ fontSize:14, fontWeight:600, color:B.ink }}>{label}</span>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        {detail && <span style={{ fontSize:12, color:B.muted }}>{detail}</span>}
        <span style={{ fontSize:10, fontWeight:700, color:c, textTransform:"uppercase", letterSpacing:"0.06em", padding:"3px 10px", borderRadius:50, background:`${c}12`, border:`1px solid ${c}25` }}>{status}</span>
      </div>
    </div>
  );
};

const MiniChart = ({ data, color = B.blue, height = 120 }) => {
  const max = Math.max(...data.map(d => d.mrr));
  return (
    <svg viewBox={`0 0 ${data.length * 60} ${height}`} style={{ width:"100%", height }}>
      {data.map((d, i) => {
        const h = max > 0 ? (d.mrr / max) * (height - 24) : 0;
        return (
          <g key={i}>
            <rect x={i*60+8} y={height - h - 2} width={44} height={h} rx={4}
              fill={color} opacity={0.15 + (i/data.length)*0.7} />
            <text x={i*60+30} y={height - h - 6} textAnchor="middle"
              style={{ fontSize:9, fontWeight:700, fill:color }}>
              {d.mrr > 0 ? `£${(d.mrr/1000).toFixed(1)}k` : ""}
            </text>
            <text x={i*60+30} y={height + 12} textAnchor="middle"
              style={{ fontSize:8, fill:B.muted }}>
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

/* ── Sections ─────────────────────────────────────────────────────────────── */
const SectionHead = ({ eyebrow, title, sub }) => (
  <div style={{ marginBottom: 32 }}>
    <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.14em", textTransform:"uppercase", color:B.blue, marginBottom:8 }}>{eyebrow}</div>
    <h2 style={{ fontFamily:"'DM Serif Display', serif", fontSize:32, fontWeight:400, color:B.navy, lineHeight:1.15, marginBottom: sub ? 10 : 0 }}>{title}</h2>
    {sub && <p style={{ fontSize:14, color:B.muted, lineHeight:1.6, maxWidth:560 }}>{sub}</p>}
  </div>
);

/* ── Main App ─────────────────────────────────────────────────────────────── */
export default function App() {
  const [scenario, setScenario] = useState("realistic");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setTimeout(() => setLoaded(true), 100); }, []);

  const proj = {
    conservative: runProjection("conservative"),
    realistic: runProjection("realistic"),
    optimistic: runProjection("optimistic"),
  };
  const active = proj[scenario];

  const scenarioColors = { conservative: B.muted, realistic: B.blue, optimistic: B.success };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=DM+Serif+Display&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        body { background:${B.cream}; font-family:'Outfit',sans-serif; color:${B.ink}; -webkit-font-smoothing:antialiased; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .fade-in { animation: fadeUp 0.6s cubic-bezier(0.16,1,0.3,1) forwards; opacity:0; }
        .scenario-btn { padding:10px 20px; border-radius:50px; border:1.5px solid ${B.border}; background:white; cursor:pointer; font-family:'Outfit',sans-serif; font-size:12; font-weight:600; color:${B.muted}; transition:all 0.25s ease; }
        .scenario-btn:hover { border-color:${B.blue}; color:${B.blue}; }
        .scenario-btn.active { background:${B.navy}; border-color:${B.navy}; color:white; }
      `}</style>

      <div style={{ maxWidth:900, margin:"0 auto", padding:"48px 24px 80px" }}>

        <div className="fade-in" style={{ animationDelay:"0s", display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:60 }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:`linear-gradient(135deg, ${B.blue}, ${B.navyMid})`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round"><path d="M3 3v18h18"/><path d="M7 16l4-8 4 4 5-10"/></svg>
              </div>
              <span style={{ fontWeight:700, fontSize:18, letterSpacing:"-0.02em", color:B.navy }}>Stryde<span style={{ color:B.blueGlow }}>OS</span></span>
            </div>
            <h1 style={{ fontFamily:"'DM Serif Display', serif", fontSize:40, fontWeight:400, color:B.navy, lineHeight:1.1, marginBottom:6 }}>
              Business Audit
            </h1>
            <p style={{ fontSize:14, color:B.muted }}>Revenue position, readiness gaps, and 12-month projections</p>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:11, color:B.muted, marginBottom:4 }}>Internal document</div>
            <div style={{ fontSize:13, fontWeight:600, color:B.navy }}>April 2026</div>
            <Badge color={B.red}>£0 MRR</Badge>
          </div>
        </div>

        <div className="fade-in" style={{ animationDelay:"0.1s", marginBottom:56 }}>
          <SectionHead
            eyebrow="Current state"
            title="You've built the product. You haven't sold it."
            sub="Every major system is production-grade. Auth, billing, compliance, two of three modules deployed. But MRR is zero and no outreach has started."
          />

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:14, marginBottom:28 }}>
            <MetricCard label="Monthly Recurring Revenue" value="£0" sub="No paying customers yet" color={B.red} accent={B.red} />
            <MetricCard label="Paying Clinics" value="0" sub="Spires = dogfood, not a customer" color={B.ink} />
            <MetricCard label="Modules Live" value="2/3" sub="Intelligence + Ava deployed" color={B.blue} accent={B.blue} />
            <MetricCard label="Infrastructure" value="100%" sub="Auth · Billing · Compliance · Hosting" color={B.success} accent={B.success} />
          </div>
        </div>

        <div className="fade-in" style={{ animationDelay:"0.15s", marginBottom:56 }}>
          <SectionHead
            eyebrow="Readiness audit"
            title="What's live, what's not, what's blocking revenue."
          />

          <div style={{ background:"white", borderRadius:16, border:`1px solid ${B.border}`, padding:"8px 28px", marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:B.muted, padding:"14px 0", borderBottom:`1px solid ${B.border}` }}>Product</div>
            <StatusRow label="Intelligence dashboard" status="live" detail="8 KPIs, clinician-level views" />
            <StatusRow label="Ava voice receptionist" status="live" detail="ElevenLabs + Twilio, phone number active" />
            <StatusRow label="Pulse retention engine" status="partial" detail="Architecture defined, build incomplete" />
            <StatusRow label="PMS pipeline — Cliniko" status="live" detail="REST API, production" />
            <StatusRow label="PMS pipeline — WriteUpp" status="partial" detail="CSV pipeline live, API access pending" />
            <StatusRow label="PMS pipeline — TM3" status="planned" detail="Highest strategic value, not started" />
          </div>

          <div style={{ background:"white", borderRadius:16, border:`1px solid ${B.border}`, padding:"8px 28px", marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:B.muted, padding:"14px 0", borderBottom:`1px solid ${B.border}` }}>Infrastructure</div>
            <StatusRow label="Firebase Auth + multi-tenancy" status="live" detail="Custom claims, tenant isolation" />
            <StatusRow label="Stripe billing" status="built" detail="Checkout components built, not converting" />
            <StatusRow label="Self-service onboarding" status="live" detail="Wizard deployed" />
            <StatusRow label="GDPR / HIPAA / PIPEDA compliance" status="live" detail="Full framework" />
            <StatusRow label="Vercel + custom domain" status="live" />
            <StatusRow label="DPA in onboarding flow" status="planned" detail="Required for enterprise" />
          </div>

          <div style={{ background:"white", borderRadius:16, border:`1px solid ${B.border}`, padding:"8px 28px" }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:B.muted, padding:"14px 0", borderBottom:`1px solid ${B.border}` }}>Revenue engine</div>
            <StatusRow label="Marketing website" status="built" detail="Not converting inbound" />
            <StatusRow label="Pitch deck" status="built" detail="Owner deck + investor deck" />
            <StatusRow label="Eve + Sean outreach" status="blocked" detail="Identified, not activated" />
            <StatusRow label="HMDG / Schumacher intro" status="planned" detail="Parked until build sprint completes" />
            <StatusRow label="Cliniko Connected Apps listing" status="planned" detail="Self-serve, actionable immediately" />
            <StatusRow label="Inbound funnel" status="blocked" detail="No booking → demo → close pipeline" />
          </div>
        </div>

        <div className="fade-in" style={{ animationDelay:"0.2s", marginBottom:56 }}>
          <SectionHead
            eyebrow="Pricing — Studio tier (anchor)"
            title="Unit economics are strong. Volume is zero."
          />

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:14, marginBottom:16 }}>
            {[
              { name:"Intelligence", price:"£99", color:B.purple, sub:"No setup fee" },
              { name:"Ava", price:"£149", color:B.blue, sub:"+ £199 one-time setup" },
              { name:"Pulse", price:"£99", color:B.teal, sub:"No setup fee · Not yet shippable" },
              { name:"Full Stack", price:"£299", color:B.navy, sub:"Save £48/mo · + £199 setup" },
            ].map(m => (
              <div key={m.name} style={{
                padding:"24px 20px", borderRadius:14, background:"white",
                border:`1px solid ${B.border}`, borderTop:`3px solid ${m.color}`,
              }}>
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:m.color, marginBottom:6 }}>{m.name}</div>
                <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:28, color:B.navy }}>{m.price}<span style={{ fontSize:14, color:B.muted }}>/mo</span></div>
                <div style={{ fontSize:11, color:B.muted, marginTop:4 }}>{m.sub}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize:12, color:B.muted, fontStyle:"italic", textAlign:"center" }}>
            Solo / Studio / Clinic tiers available · Studio shown as anchor · No lock-in contracts
          </div>
        </div>

        <div className="fade-in" style={{ animationDelay:"0.25s", marginBottom:56 }}>
          <SectionHead
            eyebrow="12-month revenue projections"
            title="Three scenarios. All start from zero."
            sub="These are modelled projections, not forecasts. Assumptions listed below each scenario. All figures use Studio tier pricing."
          />

          <div style={{ display:"flex", gap:10, marginBottom:28 }}>
            {["conservative","realistic","optimistic"].map(s => (
              <button key={s} className={`scenario-btn ${scenario === s ? "active" : ""}`}
                onClick={() => setScenario(s)}
                style={scenario === s ? { background:scenarioColors[s], borderColor:scenarioColors[s] } : {}}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          <div style={{
            background:"white", borderRadius:20, border:`1px solid ${B.border}`,
            padding:32, marginBottom:24, position:"relative", overflow:"hidden",
          }}>
            <DotGrid />
            <div style={{ position:"relative", zIndex:1 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:28 }}>
                <div>
                  <Badge color={scenarioColors[scenario]} filled>{active.label}</Badge>
                  <p style={{ fontSize:13, color:B.muted, marginTop:10, maxWidth:420 }}>{active.desc}</p>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", color:B.muted, marginBottom:4 }}>Churn assumption</div>
                  <div style={{ fontSize:20, fontWeight:700, color:B.ink }}>{(active.churnRate*100).toFixed(0)}%<span style={{ fontSize:12, color:B.muted }}> /mo</span></div>
                </div>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:14, marginBottom:28 }}>
                <MetricCard label="Month 12 MRR" value={`£${active.endMRR.toLocaleString()}`} color={scenarioColors[scenario]} accent={scenarioColors[scenario]} />
                <MetricCard label="Implied ARR" value={`£${(active.endARR/1000).toFixed(0)}k`} color={B.navy} />
                <MetricCard label="Clinics (M12)" value={active.endClinics} color={B.ink} />
                <MetricCard label="Y1 Total Collected" value={`£${(active.totalCollected/1000).toFixed(0)}k`} sub="MRR + setup fees" color={B.ink} />
              </div>

              <div style={{ marginBottom:8 }}>
                <div style={{ fontSize:11, fontWeight:600, color:B.muted, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.06em" }}>Monthly recurring revenue trajectory</div>
                <MiniChart data={active.months} color={scenarioColors[scenario]} height={110} />
              </div>
            </div>
          </div>

          <div style={{ background:"white", borderRadius:16, border:`1px solid ${B.border}`, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ borderBottom:`2px solid ${B.border}` }}>
                  <th style={{ padding:"14px 20px", textAlign:"left", fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", letterSpacing:"0.08em" }}>Scenario</th>
                  <th style={{ padding:"14px 20px", textAlign:"right", fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", letterSpacing:"0.08em" }}>M12 Clinics</th>
                  <th style={{ padding:"14px 20px", textAlign:"right", fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", letterSpacing:"0.08em" }}>M12 MRR</th>
                  <th style={{ padding:"14px 20px", textAlign:"right", fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", letterSpacing:"0.08em" }}>Implied ARR</th>
                  <th style={{ padding:"14px 20px", textAlign:"right", fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", letterSpacing:"0.08em" }}>Y1 Collected</th>
                </tr>
              </thead>
              <tbody>
                {["conservative","realistic","optimistic"].map(s => {
                  const p = proj[s];
                  const isActive = s === scenario;
                  return (
                    <tr key={s} onClick={() => setScenario(s)} style={{
                      borderBottom:`1px solid ${B.border}`, cursor:"pointer",
                      background: isActive ? `${scenarioColors[s]}08` : "transparent",
                      transition: "background 0.2s ease",
                    }}>
                      <td style={{ padding:"14px 20px", fontWeight: isActive ? 700 : 500 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ width:8, height:8, borderRadius:"50%", background:scenarioColors[s] }} />
                          {p.label}
                        </div>
                      </td>
                      <td style={{ padding:"14px 20px", textAlign:"right", fontWeight:600 }}>{p.endClinics}</td>
                      <td style={{ padding:"14px 20px", textAlign:"right", fontWeight:600, color:scenarioColors[s] }}>£{p.endMRR.toLocaleString()}</td>
                      <td style={{ padding:"14px 20px", textAlign:"right", fontWeight:600 }}>£{(p.endARR/1000).toFixed(0)}k</td>
                      <td style={{ padding:"14px 20px", textAlign:"right", fontWeight:600 }}>£{(p.totalCollected/1000).toFixed(0)}k</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize:11, color:B.muted, marginTop:12, fontStyle:"italic", lineHeight:1.6 }}>
            All projections are modelled estimates using Studio tier pricing. ARPC (average revenue per clinic) varies by scenario based on assumed module mix. Setup fees assume {(active.setupRate*100).toFixed(0)}% Ava adoption. Churn modelled monthly. No annual prepayment discount applied.
          </div>
        </div>

        <div className="fade-in" style={{ animationDelay:"0.3s", marginBottom:56 }}>
          <SectionHead
            eyebrow="Critical gaps"
            title="Five things between you and first revenue."
          />

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            {[
              {
                n: "1", title: "No outreach motion",
                body: "Eve and Sean are identified but not activated. No cold outreach has been sent. No pipeline exists.",
                impact: "Blocks all revenue",
                color: B.red,
              },
              {
                n: "2", title: "No inbound funnel",
                body: "Website exists but there's no booking link → demo → close pipeline. The CTA goes to a Calendly placeholder.",
                impact: "Organic leads lost",
                color: B.red,
              },
              {
                n: "3", title: "Pulse not shippable",
                body: "Architecture defined but the module isn't built. Full Stack tier requires it. Limits ARPC.",
                impact: "Caps deal size",
                color: B.amber,
              },
              {
                n: "4", title: "No discovery call structure",
                body: "The 'Clinical Performance Audit' CTA exists but there's no structured call framework. Need a repeatable 25-minute format that diagnoses, demos, and closes.",
                impact: "Conversion drag",
                color: B.amber,
              },
              {
                n: "5", title: "No case study asset",
                body: "Spires data exists but hasn't been packaged into a shareable case study. Outreach needs proof.",
                impact: "Conversion drag",
                color: B.amber,
              },
            ].map(g => (
              <div key={g.n} style={{
                padding:24, borderRadius:16, background:"white",
                border:`1px solid ${B.border}`, borderLeft:`4px solid ${g.color}`,
                display:"flex", flexDirection:"column", gap:8,
              }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:26, height:26, borderRadius:8, background:`${g.color}12`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800, color:g.color }}>{g.n}</div>
                    <span style={{ fontSize:15, fontWeight:700, color:B.ink }}>{g.title}</span>
                  </div>
                </div>
                <p style={{ fontSize:13, color:B.muted, lineHeight:1.55 }}>{g.body}</p>
                <Badge color={g.color}>{g.impact}</Badge>
              </div>
            ))}

            <div style={{
              padding:28, borderRadius:16,
              background:`linear-gradient(135deg, ${B.navy}, ${B.navyMid})`,
              border:`2px solid ${B.blue}`,
              gridColumn:"1 / -1",
              position:"relative", overflow:"hidden",
            }}>
              <DotGrid />
              <div style={{ position:"relative", zIndex:1 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                  <div style={{ width:32, height:32, borderRadius:10, background:B.blue, display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                  </div>
                  <span style={{ fontSize:10, fontWeight:800, letterSpacing:"0.14em", textTransform:"uppercase", color:B.blueGlow }}>Task Initiator — Your ONE Next Move</span>
                </div>
                <h3 style={{ fontFamily:"'DM Serif Display', serif", fontSize:28, fontWeight:400, color:"white", lineHeight:1.2, marginBottom:10 }}>
                  Activate Eve and Sean this week.
                </h3>
                <p style={{ fontSize:14, color:"rgba(255,255,255,0.55)", lineHeight:1.65, maxWidth:640, marginBottom:16 }}>
                  The product is built. The pitch deck exists. The pricing is set. The only thing between you and MRR is someone sending messages to clinic owners. Everything else — Pulse, TM3, HMDG — is optimisation on top of revenue that doesn't exist yet.
                </p>
                <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                  <div style={{ padding:"10px 16px", borderRadius:10, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)" }}>
                    <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", marginBottom:3 }}>First physical action</div>
                    <div style={{ fontSize:13, fontWeight:600, color:"white" }}>Send Eve the owner deck + 10 target clinic names</div>
                  </div>
                  <div style={{ padding:"10px 16px", borderRadius:10, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)" }}>
                    <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", marginBottom:3 }}>Time to complete</div>
                    <div style={{ fontSize:13, fontWeight:600, color:"white" }}>30 minutes</div>
                  </div>
                  <div style={{ padding:"10px 16px", borderRadius:10, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)" }}>
                    <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", marginBottom:3 }}>Revenue impact</div>
                    <div style={{ fontSize:13, fontWeight:600, color:B.successBright }}>Unblocks all three scenarios</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ textAlign:"center", padding:"32px 0 0", borderTop:`1px solid ${B.border}` }}>
          <p style={{ fontSize:11, color:B.muted }}>
            StrydeOS Business Audit · April 2026 · Internal use only · hello@strydeos.com
          </p>
          <p style={{ fontSize:10, color:`${B.muted}80`, marginTop:4 }}>
            Revenue projections are modelled estimates, not forecasts. All pricing references Studio tier.
          </p>
        </div>
      </div>
    </>
  );
}
