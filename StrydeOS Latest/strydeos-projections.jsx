import { useState, useEffect } from "react";

/* ───────────────────────────────────────────────────────────────────────────
   StrydeOS — Revised Financial Projections · April 2026
   Based on £399-cap pricing (Solo/Studio/Clinic)
   ─────────────────────────────────────────────────────────────────────────── */

const B = {
  blue: "#1C54F2", blueBright: "#2E6BFF", blueGlow: "#4B8BF5",
  navy: "#0B2545", navyMid: "#132D5E",
  teal: "#0891B2", purple: "#8B5CF6",
  success: "#059669", successBright: "#34D399",
  red: "#EF4444", amber: "#F59E0B",
  ink: "#111827", muted: "#6B7280",
  cloud: "#F2F1EE", cream: "#FAF9F7",
  border: "#E2DFDA",
};

const PRICING = {
  solo:   { Intelligence: 69,  Ava: 99,  Pulse: 79,  full: 199, setup: 199 },
  studio: { Intelligence: 99,  Ava: 149, Pulse: 99,  full: 299, setup: 199 },
  clinic: { Intelligence: 149, Ava: 199, Pulse: 149, full: 399, setup: 199 },
};

const OLD_PRICING = {
  solo:   { Intelligence: 79,  Ava: 129, Pulse: 99,  full: 259, setup: 250 },
  studio: { Intelligence: 129, Ava: 199, Pulse: 149, full: 399, setup: 250 },
  clinic: { Intelligence: 199, Ava: 299, Pulse: 229, full: 599, setup: 250 },
};

function runProjection(scenario, pricingSet = "new") {
  const setup = pricingSet === "new" ? 199 : 250;
  const configs = {
    conservative: {
      label: "Conservative",
      monthlyAdds: [0,1,1,1,1,1,1,2,2,2,2,2],
      churnRate: 0.06,
      arpc: pricingSet === "new" ? 140 : 185,
      setupRate: 0.3,
      desc: "Jamal selling solo, word-of-mouth only, mostly Intelligence module"
    },
    realistic: {
      label: "Realistic",
      monthlyAdds: [1,1,2,2,3,3,3,4,4,4,5,5],
      churnRate: 0.04,
      arpc: pricingSet === "new" ? 205 : 270,
      setupRate: 0.5,
      desc: "Eve + Sean + Yves activated, outreach converting, Spires case study live"
    },
    optimistic: {
      label: "Optimistic",
      monthlyAdds: [2,2,3,4,4,5,5,6,6,7,7,8],
      churnRate: 0.03,
      arpc: pricingSet === "new" ? 260 : 340,
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
    const setupFees = c.monthlyAdds[i] * c.setupRate * setup;
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

const MetricCard = ({ label, value, sub, color = B.ink, accent, small }) => (
  <div style={{
    padding: small ? "18px 16px" : "28px 24px", borderRadius: 16,
    border: `1px solid ${B.border}`, background: "white",
    position: "relative", overflow: "hidden",
  }}>
    {accent && <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:accent }} />}
    <div style={{ fontSize: 11, fontWeight: 600, color: B.muted, letterSpacing: "0.04em", marginBottom: small ? 6 : 10, textTransform: "uppercase" }}>{label}</div>
    <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: small ? 24 : 36, color, lineHeight: 1, marginBottom: sub ? 6 : 0 }}>
      {value}
    </div>
    {sub && <div style={{ fontSize: 12, color: B.muted, lineHeight: 1.5 }}>{sub}</div>}
  </div>
);

const MiniChart = ({ data, color = B.blue, height = 110 }) => {
  const max = Math.max(...data.map(d => d.mrr));
  return (
    <svg viewBox={`0 0 ${data.length * 60} ${height + 16}`} style={{ width:"100%", height: height + 16 }}>
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

const SectionHead = ({ eyebrow, title, sub }) => (
  <div style={{ marginBottom: 32 }}>
    <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.14em", textTransform:"uppercase", color:B.blue, marginBottom:8 }}>{eyebrow}</div>
    <h2 style={{ fontFamily:"'DM Serif Display', serif", fontSize:32, fontWeight:400, color:B.navy, lineHeight:1.15, marginBottom: sub ? 10 : 0 }}>{title}</h2>
    {sub && <p style={{ fontSize:14, color:B.muted, lineHeight:1.6, maxWidth:560 }}>{sub}</p>}
  </div>
);

const fmt = n => `£${n.toLocaleString()}`;

export default function App() {
  const [scenario, setScenario] = useState("realistic");
  const [showOld, setShowOld] = useState(false);

  useEffect(() => {
    const l = document.createElement("link");
    l.href = "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=DM+Serif+Display&display=swap";
    l.rel = "stylesheet";
    document.head.appendChild(l);
  }, []);

  const newProj = { conservative: runProjection("conservative","new"), realistic: runProjection("realistic","new"), optimistic: runProjection("optimistic","new") };
  const oldProj = { conservative: runProjection("conservative","old"), realistic: runProjection("realistic","old"), optimistic: runProjection("optimistic","old") };
  const active = newProj[scenario];
  const activeOld = oldProj[scenario];

  const scenarioColors = { conservative: B.muted, realistic: B.blue, optimistic: B.success };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=DM+Serif+Display&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        body { background:${B.cream}; font-family:'Outfit',sans-serif; color:${B.ink}; -webkit-font-smoothing:antialiased; }
        .scenario-btn { padding:10px 20px; border-radius:50px; border:1.5px solid ${B.border}; background:white; cursor:pointer; font-family:'Outfit',sans-serif; font-size:12px; font-weight:600; color:${B.muted}; transition:all 0.25s ease; }
        .scenario-btn:hover { border-color:${B.blue}; color:${B.blue}; }
        .scenario-btn.active { background:${B.navy}; border-color:${B.navy}; color:white; }
        .toggle-btn { padding:8px 16px; border-radius:10px; border:1.5px solid ${B.border}; background:white; cursor:pointer; font-family:'Outfit',sans-serif; font-size:11px; font-weight:600; color:${B.muted}; transition:all 0.2s; }
        .toggle-btn.on { background:${B.navy}; border-color:${B.navy}; color:white; }
      `}</style>

      <div style={{ maxWidth:920, margin:"0 auto", padding:"48px 24px 80px" }}>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:56 }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:`linear-gradient(135deg, ${B.blue}, ${B.navyMid})`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round"><path d="M3 3v18h18"/><path d="M7 16l4-8 4 4 5-10"/></svg>
              </div>
              <span style={{ fontWeight:700, fontSize:18, letterSpacing:"-0.02em", color:B.navy }}>Stryde<span style={{ color:B.blueGlow }}>OS</span></span>
            </div>
            <h1 style={{ fontFamily:"'DM Serif Display', serif", fontSize:38, fontWeight:400, color:B.navy, lineHeight:1.1, marginBottom:6 }}>
              Revised Financial Projections
            </h1>
            <p style={{ fontSize:14, color:B.muted }}>£399-cap pricing · 12-month outlook · All three scenarios</p>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:11, color:B.muted, marginBottom:4 }}>Internal document</div>
            <div style={{ fontSize:13, fontWeight:600, color:B.navy }}>April 2026</div>
          </div>
        </div>

        <div style={{ marginBottom:56 }}>
          <SectionHead eyebrow="Revised pricing — Studio tier (anchor)" title="Lower entry, same margins, UK-realistic." />

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:14, marginBottom:16 }}>
            {[
              { name:"Intelligence", price:"£99", old:"£129", color:B.purple, sub:"No setup fee" },
              { name:"Ava", price:"£149", old:"£199", color:B.blue, sub:"+ £199 one-time setup" },
              { name:"Pulse", price:"£99", old:"£149", color:B.teal, sub:"No setup fee" },
              { name:"Full Stack", price:"£299", old:"£399", color:B.navy, sub:"Save £48/mo · + £199 setup" },
            ].map(m => (
              <div key={m.name} style={{
                padding:"24px 20px", borderRadius:14, background:"white",
                border:`1px solid ${B.border}`, borderTop:`3px solid ${m.color}`,
              }}>
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:m.color, marginBottom:6 }}>{m.name}</div>
                <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:28, color:B.navy }}>
                  {m.price}<span style={{ fontSize:14, color:B.muted }}>/mo</span>
                </div>
                <div style={{ fontSize:11, color:B.muted, marginTop:4 }}>{m.sub}</div>
                <div style={{ fontSize:10, color:B.red, marginTop:6, textDecoration:"line-through", opacity:0.5 }}>was {m.old}/mo</div>
              </div>
            ))}
          </div>

          <div style={{ background:"white", borderRadius:16, border:`1px solid ${B.border}`, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ borderBottom:`2px solid ${B.border}` }}>
                  {["Tier","Intelligence","Ava","Pulse","Full Stack","Setup"].map(h => (
                    <th key={h} style={{ padding:"14px 16px", textAlign: h === "Tier" ? "left" : "right", fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { tier:"Solo", id:"solo", sub:"1 clinician" },
                  { tier:"Studio", id:"studio", sub:"2–4 clinicians" },
                  { tier:"Clinic", id:"clinic", sub:"6+ clinicians" },
                ].map(row => {
                  const p = PRICING[row.id];
                  const o = OLD_PRICING[row.id];
                  return (
                    <tr key={row.id} style={{ borderBottom:`1px solid ${B.border}` }}>
                      <td style={{ padding:"14px 16px" }}>
                        <div style={{ fontWeight:700, color:B.ink }}>{row.tier}</div>
                        <div style={{ fontSize:11, color:B.muted }}>{row.sub}</div>
                      </td>
                      <td style={{ padding:"14px 16px", textAlign:"right" }}>
                        <span style={{ fontWeight:600, color:B.purple }}>£{p.Intelligence}</span>
                        <span style={{ fontSize:10, color:B.muted, marginLeft:6, textDecoration:"line-through" }}>£{o.Intelligence}</span>
                      </td>
                      <td style={{ padding:"14px 16px", textAlign:"right" }}>
                        <span style={{ fontWeight:600, color:B.blue }}>£{p.Ava}</span>
                        <span style={{ fontSize:10, color:B.muted, marginLeft:6, textDecoration:"line-through" }}>£{o.Ava}</span>
                      </td>
                      <td style={{ padding:"14px 16px", textAlign:"right" }}>
                        <span style={{ fontWeight:600, color:B.teal }}>£{p.Pulse}</span>
                        <span style={{ fontSize:10, color:B.muted, marginLeft:6, textDecoration:"line-through" }}>£{o.Pulse}</span>
                      </td>
                      <td style={{ padding:"14px 16px", textAlign:"right" }}>
                        <span style={{ fontWeight:800, color:B.ink }}>£{p.full}</span>
                        <span style={{ fontSize:10, color:B.muted, marginLeft:6, textDecoration:"line-through" }}>£{o.full}</span>
                      </td>
                      <td style={{ padding:"14px 16px", textAlign:"right", fontSize:12, color:B.muted }}>£{p.setup}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop:14, padding:"14px 20px", borderRadius:12, background:"rgba(5,150,105,0.06)", border:`1px solid rgba(5,150,105,0.15)` }}>
            <div style={{ fontSize:12, color:B.success, fontWeight:600, marginBottom:4 }}>The trade-off</div>
            <div style={{ fontSize:13, color:B.ink, lineHeight:1.6 }}>
              Lower ARPC per clinic, but the £399 ceiling removes the biggest UK objection — price shock.
              The thesis: lower entry friction converts more clinics, and module expansion over time recovers per-clinic revenue.
              Land with Intelligence at £69, expand to Full Stack at £299–399.
            </div>
          </div>
        </div>

        <div style={{ marginBottom:56 }}>
          <SectionHead
            eyebrow="12-month revenue projections"
            title="Three scenarios at revised pricing."
            sub="All figures use the new £399-cap pricing. Toggle comparison to see old pricing side-by-side."
          />

          <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:28, flexWrap:"wrap" }}>
            {["conservative","realistic","optimistic"].map(s => (
              <button key={s} className={`scenario-btn ${scenario === s ? "active" : ""}`}
                onClick={() => setScenario(s)}
                style={scenario === s ? { background:scenarioColors[s], borderColor:scenarioColors[s] } : {}}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <div style={{ flex:1 }} />
            <button className={`toggle-btn ${showOld ? "on" : ""}`} onClick={() => setShowOld(!showOld)}>
              {showOld ? "✓ " : ""}Compare old pricing
            </button>
          </div>

          <div style={{ background:"white", borderRadius:20, border:`1px solid ${B.border}`, padding:32, marginBottom:24, position:"relative", overflow:"hidden" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:28 }}>
              <div>
                <Badge color={scenarioColors[scenario]} filled>{active.label}</Badge>
                <p style={{ fontSize:13, color:B.muted, marginTop:10, maxWidth:420 }}>{active.desc}</p>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", color:B.muted, marginBottom:4 }}>ARPC (new)</div>
                <div style={{ fontSize:20, fontWeight:700, color:B.ink }}>£{active.arpc}<span style={{ fontSize:12, color:B.muted }}>/mo</span></div>
                {showOld && <div style={{ fontSize:11, color:B.muted, marginTop:2, textDecoration:"line-through" }}>was £{activeOld.arpc}</div>}
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns: showOld ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap:14, marginBottom:28 }}>
              {!showOld ? (
                <>
                  <MetricCard label="Month 12 MRR" value={fmt(active.endMRR)} color={scenarioColors[scenario]} accent={scenarioColors[scenario]} />
                  <MetricCard label="Implied ARR" value={`£${(active.endARR/1000).toFixed(0)}k`} color={B.navy} />
                  <MetricCard label="Clinics (M12)" value={active.endClinics} color={B.ink} />
                  <MetricCard label="Y1 Total Collected" value={`£${(active.totalCollected/1000).toFixed(0)}k`} sub="MRR + setup fees" color={B.ink} />
                </>
              ) : (
                <>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:B.blue, marginBottom:10 }}>New pricing</div>
                    <div style={{ display:"grid", gap:10 }}>
                      <MetricCard small label="M12 MRR" value={fmt(active.endMRR)} color={scenarioColors[scenario]} accent={scenarioColors[scenario]} />
                      <MetricCard small label="Implied ARR" value={`£${(active.endARR/1000).toFixed(0)}k`} color={B.navy} />
                      <MetricCard small label="Clinics" value={active.endClinics} color={B.ink} />
                      <MetricCard small label="Y1 Collected" value={`£${(active.totalCollected/1000).toFixed(0)}k`} color={B.ink} />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:B.muted, marginBottom:10 }}>Old pricing</div>
                    <div style={{ display:"grid", gap:10 }}>
                      <MetricCard small label="M12 MRR" value={fmt(activeOld.endMRR)} color={B.muted} />
                      <MetricCard small label="Implied ARR" value={`£${(activeOld.endARR/1000).toFixed(0)}k`} color={B.muted} />
                      <MetricCard small label="Clinics" value={activeOld.endClinics} color={B.muted} />
                      <MetricCard small label="Y1 Collected" value={`£${(activeOld.totalCollected/1000).toFixed(0)}k`} color={B.muted} />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div>
              <div style={{ fontSize:11, fontWeight:600, color:B.muted, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.06em" }}>MRR trajectory (new pricing)</div>
              <MiniChart data={active.months} color={scenarioColors[scenario]} />
            </div>
          </div>

          <div style={{ background:"white", borderRadius:16, border:`1px solid ${B.border}`, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ borderBottom:`2px solid ${B.border}` }}>
                  <th style={{ padding:"14px 16px", textAlign:"left", fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase" }}>Scenario</th>
                  <th style={{ padding:"14px 16px", textAlign:"right", fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase" }}>M12 Clinics</th>
                  <th style={{ padding:"14px 16px", textAlign:"right", fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase" }}>M12 MRR</th>
                  <th style={{ padding:"14px 16px", textAlign:"right", fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase" }}>ARR</th>
                  <th style={{ padding:"14px 16px", textAlign:"right", fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase" }}>Y1 Collected</th>
                  {showOld && <th style={{ padding:"14px 16px", textAlign:"right", fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase" }}>Δ vs old</th>}
                </tr>
              </thead>
              <tbody>
                {["conservative","realistic","optimistic"].map(s => {
                  const p = newProj[s];
                  const o = oldProj[s];
                  const isActive = s === scenario;
                  const delta = ((p.totalCollected - o.totalCollected) / o.totalCollected * 100).toFixed(0);
                  return (
                    <tr key={s} onClick={() => setScenario(s)} style={{
                      borderBottom:`1px solid ${B.border}`, cursor:"pointer",
                      background: isActive ? `${scenarioColors[s]}08` : "transparent",
                    }}>
                      <td style={{ padding:"14px 16px", fontWeight: isActive ? 700 : 500 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ width:8, height:8, borderRadius:"50%", background:scenarioColors[s] }} />
                          {p.label}
                        </div>
                      </td>
                      <td style={{ padding:"14px 16px", textAlign:"right", fontWeight:600 }}>{p.endClinics}</td>
                      <td style={{ padding:"14px 16px", textAlign:"right", fontWeight:600, color:scenarioColors[s] }}>{fmt(p.endMRR)}</td>
                      <td style={{ padding:"14px 16px", textAlign:"right", fontWeight:600 }}>£{(p.endARR/1000).toFixed(0)}k</td>
                      <td style={{ padding:"14px 16px", textAlign:"right", fontWeight:600 }}>£{(p.totalCollected/1000).toFixed(0)}k</td>
                      {showOld && (
                        <td style={{ padding:"14px 16px", textAlign:"right", fontWeight:600, color: B.red }}>
                          {delta}%
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize:11, color:B.muted, marginTop:12, fontStyle:"italic", lineHeight:1.6 }}>
            All projections modelled at revised pricing. ARPC varies by scenario based on assumed module mix across Solo/Studio/Clinic tiers.
            Setup fees assume {(active.setupRate*100).toFixed(0)}% Ava adoption at £199. Churn modelled monthly. No annual discount applied.
          </div>
        </div>

        <div style={{ marginBottom:56 }}>
          <SectionHead eyebrow="Revenue impact" title="What the price cut costs — and what it buys." />

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginBottom:20 }}>
            {["conservative","realistic","optimistic"].map(s => {
              const n = newProj[s];
              const o = oldProj[s];
              const diff = n.totalCollected - o.totalCollected;
              const pctDiff = ((diff / o.totalCollected) * 100).toFixed(0);
              return (
                <div key={s} style={{
                  padding:24, borderRadius:16, background:"white",
                  border:`1px solid ${B.border}`, borderTop:`3px solid ${scenarioColors[s]}`,
                }}>
                  <div style={{ fontSize:11, fontWeight:700, color:scenarioColors[s], textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:12 }}>{n.label}</div>
                  <div style={{ display:"grid", gap:12 }}>
                    <div>
                      <div style={{ fontSize:10, color:B.muted }}>Y1 revenue (new)</div>
                      <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:24, color:B.ink }}>£{(n.totalCollected/1000).toFixed(0)}k</div>
                    </div>
                    <div>
                      <div style={{ fontSize:10, color:B.muted }}>Y1 revenue (old)</div>
                      <div style={{ fontSize:16, fontWeight:600, color:B.muted, textDecoration:"line-through" }}>£{(o.totalCollected/1000).toFixed(0)}k</div>
                    </div>
                    <div style={{ padding:"10px 14px", borderRadius:10, background:`${B.red}08`, border:`1px solid ${B.red}15` }}>
                      <div style={{ fontSize:10, color:B.red }}>Revenue delta</div>
                      <div style={{ fontSize:18, fontWeight:700, color:B.red }}>{pctDiff}%</div>
                      <div style={{ fontSize:11, color:B.muted }}>{fmt(diff)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{
            padding:24, borderRadius:16,
            background:`linear-gradient(135deg, ${B.navy}, ${B.navyMid})`,
            border:`2px solid ${B.blue}`,
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
              <div style={{ width:28, height:28, borderRadius:8, background:B.blue, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
              </div>
              <span style={{ fontSize:10, fontWeight:800, letterSpacing:"0.14em", textTransform:"uppercase", color:B.blueGlow }}>The bet</span>
            </div>
            <p style={{ fontSize:14, color:"rgba(255,255,255,0.7)", lineHeight:1.65, maxWidth:700 }}>
              At identical conversion rates, the price cut costs ~24% in Y1 revenue.
              But this model assumes the <em>same</em> number of clinics sign up at lower prices — which understates the conversion uplift.
              If the lower price point converts even 15% more clinics, the revenue lines converge.
              At 25% more, they cross. The lower price also accelerates word-of-mouth: £99/mo Intelligence is an impulse decision. £199 wasn't.
            </p>
          </div>
        </div>

        <div style={{ marginBottom:56 }}>
          <SectionHead eyebrow="Sensitivity" title="How many clinics to hit key milestones?" />

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14 }}>
            {[
              { target:"£5k MRR", amount:5000, color:B.amber },
              { target:"£10k MRR", amount:10000, color:B.blue },
              { target:"£20k MRR", amount:20000, color:B.success },
            ].map(t => {
              const clinicsNeeded = {
                intelligenceOnly: Math.ceil(t.amount / PRICING.studio.Intelligence),
                fullStack: Math.ceil(t.amount / PRICING.studio.full),
                mixed: Math.ceil(t.amount / 205),
              };
              return (
                <div key={t.target} style={{
                  padding:24, borderRadius:16, background:"white",
                  border:`1px solid ${B.border}`, borderTop:`3px solid ${t.color}`,
                }}>
                  <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:24, color:B.navy, marginBottom:16 }}>{t.target}</div>
                  <div style={{ display:"grid", gap:10 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}>
                      <span style={{ color:B.muted }}>Intelligence-only</span>
                      <span style={{ fontWeight:700 }}>{clinicsNeeded.intelligenceOnly} clinics</span>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}>
                      <span style={{ color:B.muted }}>Mixed modules</span>
                      <span style={{ fontWeight:700 }}>{clinicsNeeded.mixed} clinics</span>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}>
                      <span style={{ color:B.muted }}>Full Stack only</span>
                      <span style={{ fontWeight:700, color:B.success }}>{clinicsNeeded.fullStack} clinics</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ textAlign:"center", padding:"32px 0 0", borderTop:`1px solid ${B.border}` }}>
          <p style={{ fontSize:11, color:B.muted }}>
            StrydeOS · Revised Financial Projections · April 2026 · Internal use only · hello@strydeos.com
          </p>
          <p style={{ fontSize:10, color:`${B.muted}80`, marginTop:4 }}>
            Revenue projections are modelled estimates, not forecasts. All pricing references the £399-cap structure.
          </p>
        </div>
      </div>
    </>
  );
}
