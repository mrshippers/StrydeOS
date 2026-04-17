'use client';

import { useState, useEffect, useLayoutEffect, useRef } from 'react';

/* ─────────────────────────────────────────────────────────────────────────
   ChangelogMap
   ──────────────
   U-Bahn-style changelog visualisation for StrydeOS.
   Four lines, one hub: Ava / Intelligence / Platform / Pulse.
   Shipped stations sit on rings 1–5; roadmap stations sit on ring 6
   with dashed connectors.
   Self-contained — no dependencies on strydeOS-website.jsx.
───────────────────────────────────────────────────────────────────────── */

/* ─── Brand tokens (mirrors brand.ts) ─────────────────────────────────── */
const C = {
  navy:       '#0B2545',
  navyDeep:   '#060F1E',
  blue:       '#1C54F2', // Ava
  blueBright: '#2E6BFF',
  blueGlow:   '#4B8BF5',
  teal:       '#0891B2', // Pulse
  purple:     '#8B5CF6', // Intelligence
  amber:      '#F59E0B', // Platform
  cream:      '#FAF9F7',
  cloud:      '#F2F1EE',
  ink:        '#111827',
  muted:      '#6B7280',
};

const CAT_COLORS = {
  ava:      C.blue,
  intel:    C.purple,
  platform: C.amber,
  pulse:    C.teal,
};

const CAT_LABELS = {
  ava:      'Ava',
  intel:    'Intelligence',
  platform: 'Platform',
  pulse:    'Pulse',
};

/* ─── Geometry ────────────────────────────────────────────────────────── */
const VIEWBOX = 880;
const CX = 440, CY = 440, LOGO_R = 50;
// 6 rings — ring 6 is the roadmap ring, dashed
const RINGS = [0, 95, 155, 220, 285, 350, 412];

function polar(ring, deg) {
  const r = RINGS[ring];
  const rad = (deg - 90) * Math.PI / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function logoEdge(deg) {
  const rad = (deg - 90) * Math.PI / 180;
  return { x: CX + LOGO_R * Math.cos(rad), y: CY + LOGO_R * Math.sin(rad) };
}

function rgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ─── Stations ────────────────────────────────────────────────────────── */
const STATIONS_RAW = [
  // ── AVA (320°–40°) ──────────────────────────────────────────────────
  { id:'v103',  v:'v1.0.3', date:'27 Jan', cat:'ava', title:'Voice tuned',            desc:'Stability 67%, similarity 85%. Less robotic. More Ava.',                              ring:1, angle:340 },
  { id:'v110a', v:'v1.1.0', date:'3 Feb',  cat:'ava', title:'Ava goes live',          desc:'First voice agent deployed. ElevenLabs, Twilio, n8n orchestration.',                   ring:2, angle:328 },
  { id:'v114',  v:'v1.1.4', date:'3 Mar',  cat:'ava', title:'Call transfers',         desc:"Ava knows when she's out of her depth. Warm transfer to the right person.",           ring:2, angle:14  },
  { id:'v130a', v:'v1.3.0', date:'1 Apr',  cat:'ava', title:'Rebuilt on LangGraph',   desc:'Proper state machine. Real conversation memory. Structured routing.',                 ring:3, angle:345 },
  { id:'v132',  v:'v1.3.2', date:'5 Apr',  cat:'ava', title:'One-click provisioning', desc:'UK number, SIP trunk, ElevenLabs agent. Sorted in one click.',                        ring:4, angle:335 },
  { id:'v140',  v:'v1.4.0', date:'7 Apr',  cat:'ava', title:'Warm transfers',         desc:'Catches the complaint before it becomes a missed call. Clean handoff via Twilio.',    ring:5, angle:355 },
  { id:'v145',  v:'v1.4.5', date:'17 Apr', cat:'ava', title:'End-to-end booking live', desc:'Full call pipeline verified at Spires. Ring → Ava → WriteUpp → appointment in the diary.', ring:5, angle:8 },

  // ── INTELLIGENCE (50°–130°) ─────────────────────────────────────────
  { id:'v113',  v:'v1.1.3', date:'25 Feb', cat:'intel', title:'Weekly digest',        desc:'Same signal. Less noise. Your Monday is now 30 seconds shorter.',                     ring:2, angle:65  },
  { id:'v124i', v:'v1.2.4', date:'28 Mar', cat:'intel', title:'Clinician scorecards', desc:'Rebooking rate, course length, DNA rate. Per-clinician. Coaching-ready.',             ring:3, angle:80  },
  { id:'v131',  v:'v1.3.1', date:'3 Apr',  cat:'intel', title:'Benchmarks',           desc:'Your KPIs against real clinic data. Know where you stand — not just how you feel.',   ring:4, angle:90  },
  { id:'v133i', v:'v1.3.3', date:'6 Apr',  cat:'intel', title:'Revenue forecasting',  desc:'30/60/90-day projections from pipeline, rebooking, and seasonal patterns.',           ring:5, angle:75  },

  // ── PLATFORM (140°–220°) ────────────────────────────────────────────
  { id:'v090',  v:'v0.9.0', date:'2 Jan',  cat:'platform', title:'Beta closes',       desc:'Three pilot clinics onboarded. Data flowing. Time to ship.',                          ring:5, angle:215 },
  { id:'v091',  v:'v0.9.1', date:'8 Jan',  cat:'platform', title:'Billing',           desc:'Monthly plans. No lock-in. Cancel anytime.',                                          ring:4, angle:210 },
  { id:'v092',  v:'v0.9.2', date:'13 Jan', cat:'platform', title:'Security sweep',    desc:'42 edge cases across 15 domains. Nine fixes shipped before anyone asked.',            ring:3, angle:215 },
  { id:'v101',  v:'v1.0.1', date:'19 Jan', cat:'platform', title:'Onboarding wizard', desc:'PMS → Ava → Pulse → live. Five steps. Done in a week.',                                ring:1, angle:168 },
  { id:'v102',  v:'v1.0.2', date:'21 Jan', cat:'platform', title:'ROI calculator',    desc:'Corrected a bug where the numbers were too generous. We prefer conservative.',        ring:1, angle:205 },
  { id:'v111',  v:'v1.1.1', date:'10 Feb', cat:'platform', title:'Dark mode',         desc:'Because 11pm exists.',                                                                 ring:2, angle:188 },
  { id:'v120',  v:'v1.2.0', date:'8 Mar',  cat:'platform', title:'Terms updated',     desc:'Tighter data handling. Multi-region compliance language.',                            ring:2, angle:152 },
  { id:'v121',  v:'v1.2.1', date:'14 Mar', cat:'platform', title:'Sync reliability',  desc:'Patient data refreshed on every PMS run. The 30-minute idle bug — gone.',             ring:3, angle:165 },
  { id:'v122',  v:'v1.2.2', date:'19 Mar', cat:'platform', title:'Session security',  desc:'Remember Me toggle. HMAC-signed cookies. 8hr clinical workday TTL.',                  ring:3, angle:145 },
  { id:'v123',  v:'v1.2.3', date:'24 Mar', cat:'platform', title:'In-app changelog',  desc:"What shipped, when, for whom. Every user sees it once. Then it's gone.",              ring:4, angle:175 },
  { id:'v124',  v:'v1.2.4', date:'28 Mar', cat:'platform', title:'Clinician layer',   desc:"Observational notes. Clinicians see what's relevant. Owners see everything.",         ring:4, angle:148 },
  { id:'v144',  v:'v1.4.4', date:'12 Apr', cat:'platform', title:'Security hardening sweep', desc:'Demo-bypass patch. Webhook fail-safe. Cross-clinic isolation proven. 606 tests green.', ring:5, angle:148 },

  // ── PULSE (230°–310°) — existing 4 + 2 new ───────────────────────
  { id:'v112',  v:'v1.1.2', date:'18 Feb', cat:'pulse', title:'Opt-outs honoured',    desc:'Patient communication preferences enforced across every sequence.',                   ring:2, angle:270 },
  { id:'v122p', v:'v1.2.2', date:'19 Mar', cat:'pulse', title:'Review prompts',       desc:'Automated Google review requests timed to peak satisfaction. 4.8★ without asking.',  ring:3, angle:290 },
  { id:'v130p', v:'v1.3.0', date:'1 Apr',  cat:'pulse', title:'Retention engine',     desc:'Rebooking sequences, dropout detection, win-back campaigns. All in one module.',      ring:3, angle:250 },
  { id:'v132p', v:'v1.3.2', date:'5 Apr',  cat:'pulse', title:'SMS sequences',        desc:'Multi-step SMS workflows. Reminders, follow-ups, check-ins. All automated.',          ring:4, angle:268 },
  { id:'v141p', v:'v1.4.1', date:'9 Apr',  cat:'pulse', title:'NPS capture',          desc:'Post-discharge NPS collected automatically. Feeds the owner dashboard. EBITDA lever, not vanity.', ring:4, angle:248 },
  { id:'v142p', v:'v1.4.2', date:'10 Apr', cat:'pulse', title:'Dropout risk scoring', desc:'Flags patients trending toward drop-off before they disappear. Triggers Pulse outreach automatically.', ring:5, angle:260 },

  // ── ROADMAP (ring 6, dashed) ────────────────────────────────────────
  { id:'r150a',  v:'v1.5.0', date:'Next', cat:'ava',      title:'Multi-language voice', desc:'Polish, Hindi, Arabic first — based on Spires patient mix. The clinic speaks; Ava answers in kind.', ring:6, angle:355, roadmap:true },
  { id:'r150i',  v:'v1.5.0', date:'Next', cat:'intel',    title:'Outcome measures',      desc:'NPRS, PSFS, QuickDASH, ODI, NDI. Clinical-to-commercial correlation finally measurable.',           ring:6, angle:85,  roadmap:true },
  { id:'r150p',  v:'v1.5.0', date:'Next', cat:'platform', title:'TM3 integration',       desc:'Blue Zinc TM3 — the dominant legacy UK physio PMS. Filling the biggest blind spot.',                ring:6, angle:195, roadmap:true },
  { id:'r150pu', v:'v1.5.0', date:'Next', cat:'pulse',    title:'Review attribution',    desc:'Track which Pulse sequence converted to a Google review. Close the loop on reputation.',           ring:6, angle:268, roadmap:true },
];

const STATIONS = STATIONS_RAW.map(s => {
  const p = polar(s.ring, s.angle);
  return { ...s, x: p.x, y: p.y };
});

const STATION_MAP = Object.fromEntries(STATIONS.map(s => [s.id, s]));

/* ─── Lines ──────────────────────────────────────────────────────────── */
const LINES_RAW = [
  // Ava
  { cat:'ava', ids:['EDGE:340', 'v103', 'v110a', 'v130a', 'v132', 'v140', 'v145'], delay:0 },
  { cat:'ava', ids:['EDGE:14',  'v114'], delay:0.12 },
  { cat:'ava', ids:['v140',     'r150a'], delay:0.2, roadmap:true },

  // Intelligence
  { cat:'intel', ids:['EDGE:75', 'v113', 'v124i', 'v131', 'v133i'], delay:0.3 },
  { cat:'intel', ids:['v133i',   'r150i'], delay:0.4, roadmap:true },

  // Platform — three arms converging on the logo
  { cat:'platform', ids:['v090', 'v091', 'v092', 'EDGE:200'], delay:0.5 },
  { cat:'platform', ids:['EDGE:168', 'v101', 'v111', 'v122', 'v124', 'v144'], delay:0.55 },
  { cat:'platform', ids:['EDGE:205', 'v102', 'v120', 'v121', 'v123'], delay:0.65 },
  { cat:'platform', ids:['v090',     'r150p'], delay:0.75, roadmap:true },

  // Pulse
  { cat:'pulse', ids:['EDGE:265', 'v112', 'v130p', 'v132p', 'v142p'], delay:0.8 },
  { cat:'pulse', ids:['EDGE:285', 'v122p'], delay:0.85 },
  { cat:'pulse', ids:['v132p',    'v141p'], delay:0.88 },
  { cat:'pulse', ids:['v142p',    'r150pu'], delay:0.95, roadmap:true },
];

function resolvePoint(id) {
  if (typeof id === 'string' && id.startsWith('EDGE:')) {
    return logoEdge(parseFloat(id.split(':')[1]));
  }
  return STATION_MAP[id];
}

function buildPath(pts) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], c = pts[i];
    const dx = c.x - p.x, dy = c.y - p.y;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx < 1 && ady < 1) { d += ` L ${c.x.toFixed(1)} ${c.y.toFixed(1)}`; continue; }
    const diag = Math.min(adx, ady);
    d += ` L ${(p.x + diag * Math.sign(dx)).toFixed(1)} ${(p.y + diag * Math.sign(dy)).toFixed(1)} L ${c.x.toFixed(1)} ${c.y.toFixed(1)}`;
  }
  return d;
}

const PATHS = LINES_RAW
  .map((line, i) => {
    const pts = line.ids.map(resolvePoint).filter(Boolean);
    if (pts.length < 2) return null;
    return { key: `line-${i}`, d: buildPath(pts), cat: line.cat, delay: line.delay, roadmap: !!line.roadmap };
  })
  .filter(Boolean);

/* ─── MonolithMark (self-contained inline SVG) ────────────────────────── */
let _mmSeq = 0;
const MonolithMark = ({ size = 46 }) => {
  const uid = ++_mmSeq;
  const ids = {
    c: `clm-c-${uid}`, r: `clm-r-${uid}`, t: `clm-t-${uid}`,
    m: `clm-m-${uid}`, b: `clm-b-${uid}`, p: `clm-p-${uid}`, a: `clm-a-${uid}`,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" role="img" aria-label="StrydeOS">
      <defs>
        <linearGradient id={ids.c} x1="0.1" y1="0" x2="0.85" y2="1">
          <stop offset="0%"   stopColor="#2E6BFF" stopOpacity="0.58"/>
          <stop offset="100%" stopColor="#091D3E" stopOpacity="0.72"/>
        </linearGradient>
        <radialGradient id={ids.r} cx="28%" cy="24%" r="60%">
          <stop offset="0%"   stopColor="#6AABFF" stopOpacity="0.42"/>
          <stop offset="100%" stopColor="#1C54F2" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id={ids.t} x1="0.05" y1="1" x2="0.35" y2="0">
          <stop offset="0%"   stopColor="white" stopOpacity="0.55"/>
          <stop offset="100%" stopColor="white" stopOpacity="0.97"/>
        </linearGradient>
        <linearGradient id={ids.m} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="white" stopOpacity="0"/>
          <stop offset="28%"  stopColor="white" stopOpacity="0.60"/>
          <stop offset="65%"  stopColor="white" stopOpacity="0.12"/>
          <stop offset="100%" stopColor="white" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id={ids.b} x1="0.1" y1="0" x2="0.4" y2="1">
          <stop offset="0%"   stopColor="#7ABBFF" stopOpacity="0.65"/>
          <stop offset="100%" stopColor="#1C54F2" stopOpacity="0.06"/>
        </linearGradient>
        <clipPath id={ids.p}><rect x="35" y="20" width="22" height="60" rx="5"/></clipPath>
        <clipPath id={ids.a}><polygon points="35,52 57,40 57,20 35,20"/></clipPath>
      </defs>
      <rect width="100" height="100" rx="50" fill={`url(#${ids.c})`}/>
      <rect width="100" height="100" rx="50" fill={`url(#${ids.r})`}/>
      <rect width="100" height="100" rx="50" fill="none" stroke={`url(#${ids.b})`} strokeWidth="1.2"/>
      <path d="M 17 21 Q 50 12 83 21" stroke={`url(#${ids.m})`} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <rect x="35" y="20" width="22" height="60" rx="5" fill="white" fillOpacity="0.07"/>
      <rect x="35" y="46" width="22" height="34" rx="5" fill="black" fillOpacity="0.10"/>
      <g clipPath={`url(#${ids.p})`}>
        <polyline points="32,80 46,72 60,80" stroke="white" strokeOpacity="0.20" strokeWidth="2"   strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <polyline points="32,72 46,64 60,72" stroke="white" strokeOpacity="0.42" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <polyline points="32,64 46,56 60,64" stroke="white" strokeOpacity="0.72" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </g>
      <rect x="35" y="20" width="22" height="60" rx="5" fill={`url(#${ids.t})`} clipPath={`url(#${ids.a})`}/>
      <line x1="33" y1="52" x2="59" y2="39" stroke="white" strokeWidth="1.2" strokeOpacity="0.55" strokeLinecap="round"/>
    </svg>
  );
};

/* ─── Station ────────────────────────────────────────────────────────── */
const Station = ({ station: s, idx, viewportRef, darkMode }) => {
  const a = s.angle % 360;

  // Label side based on angle
  let lblStyle = {};
  if (a >= 320 || a < 40)        lblStyle = { bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)' };
  else if (a >= 40 && a < 140)   lblStyle = { left: 'calc(100% + 7px)', top: '50%', transform: 'translateY(-50%)' };
  else if (a >= 140 && a < 220)  lblStyle = { top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)' };
  else                           lblStyle = { right: 'calc(100% + 7px)', top: '50%', transform: 'translateY(-50%)', textAlign: 'right' };

  // Popover side based on angle
  let popStyle = {};
  if (a >= 320 || a < 40)        popStyle = { bottom: 'calc(100% + 18px)', left: '50%', marginLeft: -130 };
  else if (a >= 40 && a < 140)   popStyle = { left: 'calc(100% + 18px)', top: '50%', marginTop: -52 };
  else if (a >= 140 && a < 220)  popStyle = { top: 'calc(100% + 18px)', left: '50%', marginLeft: -130 };
  else                           popStyle = { right: 'calc(100% + 18px)', top: '50%', marginTop: -52 };

  const onEnter = () => viewportRef.current?.classList.add(`cl-hl-${s.cat}`);
  const onLeave = () => viewportRef.current?.classList.remove(`cl-hl-${s.cat}`);

  return (
    <div
      className={`cl-station cl-cat-${s.cat}${s.roadmap ? ' cl-roadmap' : ''}`}
      data-cat={s.cat}
      data-ring={s.ring}
      style={{
        left: `${(s.x / VIEWBOX) * 100}%`,
        top:  `${(s.y / VIEWBOX) * 100}%`,
        animationDelay: `${0.5 + idx * 0.032}s`,
      }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <span className="cl-s-label" style={lblStyle}>{s.v}</span>
      <div className="cl-popover" style={popStyle}>
        <div className="cl-pop-meta">
          <span className="cl-pop-ver">{s.v}</span>
          <span className="cl-pop-date">{s.roadmap ? 'Planned' : `${s.date} 2026`}</span>
          <span className={`cl-pop-tag cl-t-${s.cat}`}>{CAT_LABELS[s.cat]}</span>
        </div>
        <h4 className="cl-serif">{s.title}</h4>
        <p>{s.desc}</p>
      </div>
    </div>
  );
};

/* ─── Particles (client-only to avoid SSR mismatch) ──────────────────── */
const PARTICLE_COLORS = [
  'rgba(28,84,242,0.14)',
  'rgba(8,145,178,0.12)',
  'rgba(139,92,246,0.12)',
  'rgba(245,158,11,0.10)',
];

const Particles = () => {
  const [particles, setParticles] = useState([]);
  useEffect(() => {
    const list = Array.from({ length: 18 }, (_, i) => ({
      key: i,
      left: `${10 + Math.random() * 80}%`,
      top:  `${20 + Math.random() * 60}%`,
      size: `${1.5 + Math.random() * 1.5}px`,
      duration: `${8 + Math.random() * 12}s`,
      delay: `${Math.random() * 10}s`,
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
    }));
    setParticles(list);
  }, []);

  return (
    <div className="cl-particle-canvas">
      {particles.map(p => (
        <div
          key={p.key}
          className="cl-particle"
          style={{
            left: p.left, top: p.top,
            width: p.size, height: p.size,
            background: p.color,
            animationDuration: p.duration,
            animationDelay: p.delay,
          }}
        />
      ))}
    </div>
  );
};

/* ─── Main component ─────────────────────────────────────────────────── */
export default function ChangelogMap({ darkMode = false }) {
  const viewportRef = useRef(null);
  const svgRef = useRef(null);

  // Set --cl-len on line paths before first paint — prevents animation jitter
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.querySelectorAll('.cl-line-group:not(.cl-line-roadmap) .cl-line-main').forEach(main => {
      const group = main.parentElement;
      const len = main.getTotalLength();
      group.querySelectorAll('.cl-line-main, .cl-line-glass, .cl-line-specular').forEach(el => {
        el.style.setProperty('--cl-len', len);
      });
    });
  }, []);

  // Mouse tilt + data pulses + cleanup
  useEffect(() => {
    const svg = svgRef.current;
    const viewport = viewportRef.current;
    if (!svg || !viewport) return;

    let cancelled = false;

    // ── 1. 3D mouse tilt ───────────────────────────────────────────
    const container = viewport.parentElement;
    let tiltX = 0, tiltY = 0, targetX = 0, targetY = 0;
    let tiltRAF = 0;

    const onMove = (e) => {
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      targetX = y * -4;
      targetY = x * 4;
    };
    const onLeave = () => { targetX = 0; targetY = 0; };

    container.addEventListener('mousemove', onMove);
    container.addEventListener('mouseleave', onLeave);

    const animateTilt = () => {
      if (cancelled) return;
      tiltX += (targetX - tiltX) * 0.08;
      tiltY += (targetY - tiltY) * 0.08;
      viewport.style.transform = `rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg)`;
      tiltRAF = requestAnimationFrame(animateTilt);
    };
    tiltRAF = requestAnimationFrame(animateTilt);

    // ── 2. Data pulses along lines ─────────────────────────────────
    const pulseGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    pulseGroup.setAttribute('class', 'cl-pulse-group');
    svg.appendChild(pulseGroup);

    const rafIds = new Set();
    const timeouts = new Set();

    const createPulse = (path, color, startDelay) => {
      const len = path.getTotalLength();
      if (len < 10) return;

      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('r', '2.5');
      dot.setAttribute('fill', color);
      dot.style.filter = `drop-shadow(0 0 4px ${color})`;
      dot.style.opacity = '0';
      pulseGroup.appendChild(dot);

      const trail = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      trail.setAttribute('r', '1.5');
      trail.setAttribute('fill', color);
      trail.style.opacity = '0';
      pulseGroup.appendChild(trail);

      let progress = Math.random() * 0.2;
      const speed = 0.0028 + Math.random() * 0.002;

      const tick = () => {
        if (cancelled) return;
        progress += speed;
        if (progress > 1) progress = 0;

        const pt = path.getPointAtLength(progress * len);
        dot.setAttribute('cx', pt.x);
        dot.setAttribute('cy', pt.y);
        dot.style.opacity = progress < 0.04 || progress > 0.96 ? '0' : '0.75';

        const trailProg = Math.max(0, progress - 0.035);
        const tpt = path.getPointAtLength(trailProg * len);
        trail.setAttribute('cx', tpt.x);
        trail.setAttribute('cy', tpt.y);
        trail.style.opacity = trailProg < 0.04 || progress > 0.96 ? '0' : '0.3';

        const id = requestAnimationFrame(tick);
        rafIds.add(id);
      };

      const t = setTimeout(() => {
        if (cancelled) return;
        const id = requestAnimationFrame(tick);
        rafIds.add(id);
      }, 2500 + startDelay);
      timeouts.add(t);
    };

    const startT = setTimeout(() => {
      if (cancelled) return;
      svg.querySelectorAll('.cl-line-group:not(.cl-line-roadmap) .cl-line-main').forEach(path => {
        const cat = path.dataset.cat;
        const col = CAT_COLORS[cat] || C.blueGlow;
        createPulse(path, col, Math.random() * 3000);
        if (Math.random() > 0.5) createPulse(path, col, 1500 + Math.random() * 4000);
      });
    }, 300);
    timeouts.add(startT);

    return () => {
      cancelled = true;
      container.removeEventListener('mousemove', onMove);
      container.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(tiltRAF);
      rafIds.forEach(cancelAnimationFrame);
      timeouts.forEach(clearTimeout);
      if (pulseGroup.parentNode) pulseGroup.parentNode.removeChild(pulseGroup);
    };
  }, []);

  const textPrimary   = darkMode ? 'white' : C.ink;
  const textSub       = darkMode ? 'rgba(255,255,255,0.68)' : C.muted;
  const bg            = darkMode ? C.navy : C.cream;

  return (
    <section
      id="changelog"
      className={`cl-root ${darkMode ? 'cl-theme-dark' : 'cl-theme-light'}`}
      style={{
        background: bg,
        color: textPrimary,
        padding: '72px 24px 56px',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: "'Outfit', sans-serif",
      }}
    >
      <ScopedStyles darkMode={darkMode} />

      {/* Ambient glows behind the hero */}
      <div aria-hidden style={{
        position: 'absolute', top: -220, left: '50%', transform: 'translateX(-50%)',
        width: 780, height: 520, pointerEvents: 'none',
        background: `radial-gradient(ellipse, ${rgba(C.blue, darkMode ? 0.09 : 0.04)} 0%, ${rgba(C.teal, darkMode ? 0.05 : 0.02)} 42%, transparent 72%)`,
      }} />

      <div style={{ maxWidth: 960, margin: '0 auto', position: 'relative', zIndex: 2 }}>
        {/* Hero */}
        <div className="cl-hero">
          <h1 className="cl-serif cl-h1" style={{ color: textPrimary }}>
            Changelog
          </h1>
          <p className="cl-serif cl-sub" style={{ color: textSub }}>
            Find out where Stryde currently is, and see where we're going.
          </p>
        </div>

        {/* Legend */}
        <div className="cl-legend">
          {['ava','intel','platform','pulse'].map(cat => (
            <div
              key={cat}
              className="cl-legend-item"
              onMouseEnter={() => viewportRef.current?.classList.add(`cl-hl-${cat}`)}
              onMouseLeave={() => viewportRef.current?.classList.remove(`cl-hl-${cat}`)}
            >
              <span className="cl-legend-swatch" style={{ background: CAT_COLORS[cat] }} />
              {CAT_LABELS[cat]}
            </div>
          ))}
          <div className="cl-legend-item cl-legend-roadmap">
            <span className="cl-legend-swatch cl-legend-swatch-dashed" />
            Roadmap
          </div>
        </div>

        {/* Map */}
        <div className="cl-map-container">
          <div className="cl-map-viewport" ref={viewportRef}>
            <svg
              ref={svgRef}
              className="cl-map-svg"
              viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
              preserveAspectRatio="xMidYMid meet"
            >
              {/* Ring guides */}
              {[1,2,3,4,5,6].map(i => (
                <circle
                  key={`ring-${i}`}
                  cx={CX} cy={CY} r={RINGS[i]}
                  className={`cl-ring-guide${i === 6 ? ' cl-ring-roadmap' : ''}`}
                />
              ))}

              {/* Sector dividers */}
              {[45, 135, 225, 315].map(a => {
                const p = polar(5, a);
                const ep = { x: CX + (p.x - CX) * 1.06, y: CY + (p.y - CY) * 1.06 };
                return (
                  <line
                    key={`sec-${a}`}
                    x1={CX} y1={CY} x2={ep.x} y2={ep.y}
                    className="cl-sector-div"
                  />
                );
              })}

              {/* Lines — 4 layers: glow / main / glass / specular */}
              {PATHS.map(line => (
                <g
                  key={line.key}
                  className={`cl-line-group${line.roadmap ? ' cl-line-roadmap' : ''}`}
                  data-cat={line.cat}
                >
                  <path
                    d={line.d}
                    className="cl-line-glow"
                    data-cat={line.cat}
                    stroke={CAT_COLORS[line.cat]}
                    fill="none"
                    style={{ animationDelay: `${line.delay}s` }}
                  />
                  <path
                    d={line.d}
                    className="cl-line-main"
                    data-cat={line.cat}
                    stroke={CAT_COLORS[line.cat]}
                    fill="none"
                    style={{ animationDelay: `${line.delay}s` }}
                  />
                  <path
                    d={line.d}
                    className="cl-line-glass"
                    data-cat={line.cat}
                    style={{ animationDelay: `${line.delay}s` }}
                  />
                  <path
                    d={line.d}
                    className="cl-line-specular"
                    data-cat={line.cat}
                    style={{ animationDelay: `${line.delay}s` }}
                  />
                </g>
              ))}
            </svg>

            <Particles />

            {/* Stations */}
            {STATIONS.map((s, idx) => (
              <Station
                key={s.id}
                station={s}
                idx={idx}
                viewportRef={viewportRef}
                darkMode={darkMode}
              />
            ))}

            {/* Quadrant labels */}
            {[
              { text: 'Ava',          color: CAT_COLORS.ava,      angle: 0   },
              { text: 'Intelligence', color: CAT_COLORS.intel,    angle: 90  },
              { text: 'Platform',     color: CAT_COLORS.platform, angle: 180 },
              { text: 'Pulse',        color: CAT_COLORS.pulse,    angle: 270 },
            ].map(q => {
              const offset = RINGS[6] + 22;
              const rad = (q.angle - 90) * Math.PI / 180;
              const x = CX + offset * Math.cos(rad);
              const y = CY + offset * Math.sin(rad);
              return (
                <div
                  key={q.text}
                  className="cl-quad-label"
                  style={{
                    left: `${(x / VIEWBOX) * 100}%`,
                    top:  `${(y / VIEWBOX) * 100}%`,
                    color: q.color,
                  }}
                >
                  {q.text}
                </div>
              );
            })}

            {/* Center hub */}
            <div className="cl-center-hub">
              <div className="cl-logo-wrap">
                <MonolithMark size={46} />
              </div>
              <div className="cl-center-label">v1.0.0 · Launch</div>
            </div>
          </div>
        </div>

        {/* Footnote */}
        <div style={{
          textAlign: 'center',
          marginTop: 24,
          fontSize: 12,
          color: darkMode ? 'rgba(255,255,255,0.32)' : 'rgba(17,24,39,0.4)',
          letterSpacing: '0.02em',
        }}>
          Hover a station for detail · Click a line to filter
        </div>
      </div>
    </section>
  );
}

/* ─── Scoped styles ──────────────────────────────────────────────────── */
const ScopedStyles = ({ darkMode }) => {
  const css = `
    .cl-root { font-family: 'Outfit', sans-serif; }
    .cl-root .cl-serif { font-family: 'DM Serif Display', serif; font-weight: 400; }

    /* Theme vars */
    .cl-theme-dark  {
      --cl-ring-stroke: rgba(255,255,255,0.03);
      --cl-sector-stroke: rgba(255,255,255,0.02);
      --cl-station-bg: ${C.navy};
      --cl-text-muted: rgba(255,255,255,0.3);
      --cl-text-dim: rgba(255,255,255,0.45);
      --cl-pop-bg: rgba(11,37,69,0.94);
      --cl-pop-border: rgba(75,139,245,0.18);
      --cl-pop-shadow: rgba(0,0,0,0.5);
      --cl-line-opacity: 0.78;
      --cl-glass-opacity: 0.14;
      --cl-spec-opacity: 0.25;
      --cl-legend-hover: white;
      --cl-head: white;
    }
    .cl-theme-light {
      --cl-ring-stroke: rgba(11,37,69,0.06);
      --cl-sector-stroke: rgba(11,37,69,0.04);
      --cl-station-bg: ${C.cream};
      --cl-text-muted: rgba(17,24,39,0.38);
      --cl-text-dim: rgba(17,24,39,0.55);
      --cl-pop-bg: rgba(255,255,255,0.97);
      --cl-pop-border: rgba(11,37,69,0.1);
      --cl-pop-shadow: rgba(11,37,69,0.14);
      --cl-line-opacity: 0.88;
      --cl-glass-opacity: 0.2;
      --cl-spec-opacity: 0.3;
      --cl-legend-hover: ${C.ink};
      --cl-head: ${C.ink};
    }

    /* Hero */
    .cl-hero { text-align: center; margin-bottom: 28px; }
    .cl-badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 14px; border-radius: 50px;
      font-size: 11px; font-weight: 600;
      letter-spacing: 0.1em; text-transform: uppercase;
      margin-bottom: 18px;
    }
    .cl-h1 {
      font-size: clamp(2.4rem, 5.5vw, 3.4rem);
      line-height: 1.05; letter-spacing: -0.015em;
      margin-bottom: 8px;
    }
    .cl-sub {
      font-size: clamp(1.05rem, 2.2vw, 1.35rem);
      line-height: 1.4; max-width: 520px; margin: 0 auto;
    }

    /* Legend */
    .cl-legend {
      display: flex; justify-content: center; gap: 28px;
      padding: 6px 16px 18px; flex-wrap: wrap;
    }
    .cl-legend-item {
      display: flex; align-items: center; gap: 8px;
      font-size: 11px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      cursor: pointer; color: var(--cl-text-dim);
      transition: color 0.2s;
    }
    .cl-legend-item:hover { color: var(--cl-legend-hover); }
    .cl-legend-swatch { width: 22px; height: 3px; border-radius: 2px; }
    .cl-legend-swatch-dashed {
      background: transparent !important;
      border-top: 2px dashed var(--cl-text-dim);
      height: 0; width: 22px;
    }

    /* Map */
    .cl-map-container {
      display: flex; justify-content: center; align-items: center;
      padding: 4px 0 8px;
      perspective: 1800px;
    }
    .cl-map-viewport {
      position: relative;
      width: min(94vw, 880px);
      aspect-ratio: 1 / 1;
      transform-style: preserve-3d;
      transition: transform 0.12s ease-out;
    }
    .cl-map-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }

    .cl-map-viewport::before {
      content: '';
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%,-50%);
      width: 118%; height: 118%; border-radius: 50%;
      background:
        radial-gradient(circle at 50% 50%, ${rgba(C.blue,   0.12)} 0%, transparent 42%),
        radial-gradient(circle at 30% 30%, ${rgba(C.teal,   0.09)} 0%, transparent 38%),
        radial-gradient(circle at 70% 70%, ${rgba(C.purple, 0.08)} 0%, transparent 38%),
        radial-gradient(circle at 65% 25%, ${rgba(C.amber,  0.06)} 0%, transparent 34%);
      animation: cl-map-pulse 5s ease-in-out infinite alternate;
      pointer-events: none;
    }
    .cl-theme-light .cl-map-viewport::before {
      background:
        radial-gradient(circle at 50% 50%, ${rgba(C.blue,   0.06)} 0%, transparent 42%),
        radial-gradient(circle at 30% 30%, ${rgba(C.teal,   0.04)} 0%, transparent 38%),
        radial-gradient(circle at 70% 70%, ${rgba(C.purple, 0.04)} 0%, transparent 38%),
        radial-gradient(circle at 65% 25%, ${rgba(C.amber,  0.03)} 0%, transparent 34%);
    }
    @keyframes cl-map-pulse {
      0%   { opacity: 0.7; transform: translate(-50%,-50%) scale(0.96); }
      100% { opacity: 1;   transform: translate(-50%,-50%) scale(1.1); }
    }

    /* Rings + sectors */
    .cl-ring-guide { fill: none; stroke: var(--cl-ring-stroke); stroke-width: 1; }
    .cl-ring-roadmap { stroke-dasharray: 2 6; }
    .cl-sector-div { stroke: var(--cl-sector-stroke); stroke-width: 1; stroke-dasharray: 4 6; }

    /* Lines — 4 layers */
    .cl-line-glow {
      stroke-width: 14; stroke-opacity: 0.1;
      stroke-linecap: round; stroke-linejoin: round;
      animation: cl-line-pulse 4s ease-in-out infinite alternate;
      transition: stroke-opacity 0.3s, stroke-width 0.3s;
    }
    .cl-line-main {
      stroke-width: 3.5; stroke-linecap: round; stroke-linejoin: round;
      stroke-opacity: var(--cl-line-opacity);
      stroke-dasharray: var(--cl-len, 2000);
      stroke-dashoffset: var(--cl-len, 2000);
      animation: cl-draw-line 2s ease-out forwards;
      transition: stroke-opacity 0.3s, stroke-width 0.3s;
    }
    .cl-line-glass {
      fill: none; stroke: white; stroke-width: 1.8;
      stroke-opacity: var(--cl-glass-opacity);
      stroke-linecap: round; stroke-linejoin: round;
      stroke-dasharray: var(--cl-len, 2000);
      stroke-dashoffset: var(--cl-len, 2000);
      animation: cl-draw-line 2s ease-out forwards;
      transition: stroke-opacity 0.3s;
    }
    .cl-line-specular {
      fill: none; stroke: white; stroke-width: 0.6;
      stroke-opacity: var(--cl-spec-opacity);
      stroke-linecap: round; stroke-linejoin: round;
      stroke-dasharray: var(--cl-len, 2000);
      stroke-dashoffset: var(--cl-len, 2000);
      animation: cl-draw-line 2s ease-out forwards;
    }
    @keyframes cl-draw-line { to { stroke-dashoffset: 0; } }
    @keyframes cl-line-pulse {
      0%   { stroke-opacity: 0.06; stroke-width: 12; }
      100% { stroke-opacity: 0.18; stroke-width: 20; }
    }

    /* Roadmap line overrides — dashed, faded, no glass/glow */
    .cl-line-roadmap .cl-line-main {
      stroke-dasharray: 6 5;
      stroke-dashoffset: 0;
      stroke-opacity: 0;
      stroke-width: 2;
      animation: cl-fade-line 1.4s ease-out 1.8s forwards;
    }
    .cl-line-roadmap .cl-line-glass,
    .cl-line-roadmap .cl-line-specular,
    .cl-line-roadmap .cl-line-glow { display: none; }
    @keyframes cl-fade-line { to { stroke-opacity: 0.45; } }

    /* Highlight state — dim all, emphasise matching */
    .cl-map-viewport[class*="cl-hl-"] .cl-line-main     { stroke-opacity: 0.1 !important; }
    .cl-map-viewport[class*="cl-hl-"] .cl-line-glow     { stroke-opacity: 0.01 !important; }
    .cl-map-viewport[class*="cl-hl-"] .cl-line-glass    { stroke-opacity: 0.03 !important; }
    .cl-map-viewport[class*="cl-hl-"] .cl-line-specular { stroke-opacity: 0.04 !important; }
    .cl-map-viewport[class*="cl-hl-"] .cl-station        { opacity: 0.18 !important; }

    .cl-map-viewport.cl-hl-ava      .cl-line-main[data-cat="ava"],
    .cl-map-viewport.cl-hl-intel    .cl-line-main[data-cat="intel"],
    .cl-map-viewport.cl-hl-platform .cl-line-main[data-cat="platform"],
    .cl-map-viewport.cl-hl-pulse    .cl-line-main[data-cat="pulse"]
    { stroke-opacity: 1 !important; stroke-width: 4.4 !important; }

    .cl-map-viewport.cl-hl-ava      .cl-line-glow[data-cat="ava"],
    .cl-map-viewport.cl-hl-intel    .cl-line-glow[data-cat="intel"],
    .cl-map-viewport.cl-hl-platform .cl-line-glow[data-cat="platform"],
    .cl-map-viewport.cl-hl-pulse    .cl-line-glow[data-cat="pulse"]
    { stroke-opacity: 0.28 !important; stroke-width: 20 !important; }

    .cl-map-viewport.cl-hl-ava      .cl-line-glass[data-cat="ava"],
    .cl-map-viewport.cl-hl-intel    .cl-line-glass[data-cat="intel"],
    .cl-map-viewport.cl-hl-platform .cl-line-glass[data-cat="platform"],
    .cl-map-viewport.cl-hl-pulse    .cl-line-glass[data-cat="pulse"]
    { stroke-opacity: 0.25 !important; stroke-width: 2.1 !important; }

    .cl-map-viewport.cl-hl-ava      .cl-line-specular[data-cat="ava"],
    .cl-map-viewport.cl-hl-intel    .cl-line-specular[data-cat="intel"],
    .cl-map-viewport.cl-hl-platform .cl-line-specular[data-cat="platform"],
    .cl-map-viewport.cl-hl-pulse    .cl-line-specular[data-cat="pulse"]
    { stroke-opacity: 0.45 !important; }

    .cl-map-viewport.cl-hl-ava      .cl-station.cl-cat-ava,
    .cl-map-viewport.cl-hl-intel    .cl-station.cl-cat-intel,
    .cl-map-viewport.cl-hl-platform .cl-station.cl-cat-platform,
    .cl-map-viewport.cl-hl-pulse    .cl-station.cl-cat-pulse
    { opacity: 1 !important; }

    /* Stations */
    .cl-station {
      position: absolute; width: 12px; height: 12px; border-radius: 50%;
      border: 2.5px solid; background: var(--cl-station-bg);
      cursor: pointer;
      transform: translate(-50%, -50%);
      transition:
        transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
        box-shadow 0.3s, background 0.2s, opacity 0.3s;
      z-index: 10; opacity: 0;
      animation: cl-dot-in 0.42s ease forwards;
    }
    .cl-station:hover {
      transform: translate(-50%, -50%) scale(1.78);
      background: currentColor;
    }
    .cl-station.cl-cat-ava      { border-color: ${CAT_COLORS.ava};      color: ${CAT_COLORS.ava}; }
    .cl-station.cl-cat-intel    { border-color: ${CAT_COLORS.intel};    color: ${CAT_COLORS.intel}; }
    .cl-station.cl-cat-platform { border-color: ${CAT_COLORS.platform}; color: ${CAT_COLORS.platform}; }
    .cl-station.cl-cat-pulse    { border-color: ${CAT_COLORS.pulse};    color: ${CAT_COLORS.pulse}; }
    .cl-station.cl-cat-ava:hover      { box-shadow: 0 0 22px ${rgba(CAT_COLORS.ava, 0.55)}; }
    .cl-station.cl-cat-intel:hover    { box-shadow: 0 0 22px ${rgba(CAT_COLORS.intel, 0.55)}; }
    .cl-station.cl-cat-platform:hover { box-shadow: 0 0 22px ${rgba(CAT_COLORS.platform, 0.55)}; }
    .cl-station.cl-cat-pulse:hover    { box-shadow: 0 0 22px ${rgba(CAT_COLORS.pulse, 0.55)}; }
    .cl-station.cl-roadmap { border-style: dashed; opacity: 0.7; }
    .cl-station.cl-roadmap:hover { opacity: 1; }

    @keyframes cl-dot-in {
      from { opacity: 0; transform: translate(-50%,-50%) scale(0); }
      to   { opacity: 1; transform: translate(-50%,-50%) scale(1); }
    }

    /* Station label */
    .cl-s-label {
      position: absolute; white-space: nowrap;
      font-size: 9px; font-weight: 600;
      color: var(--cl-text-muted);
      pointer-events: none;
      letter-spacing: 0.02em;
      transition: color 0.2s;
    }
    .cl-station:hover .cl-s-label { color: var(--cl-legend-hover); }

    /* Popover */
    .cl-popover {
      position: absolute; width: 260px;
      padding: 14px 16px;
      background: var(--cl-pop-bg);
      backdrop-filter: blur(20px) saturate(1.5);
      -webkit-backdrop-filter: blur(20px) saturate(1.5);
      border: 1px solid var(--cl-pop-border);
      border-radius: 12px;
      pointer-events: none;
      opacity: 0; transform: scale(0.94);
      transition: opacity 0.22s, transform 0.22s cubic-bezier(0.34,1.56,0.64,1);
      z-index: 100;
      box-shadow: 0 14px 48px var(--cl-pop-shadow);
    }
    .cl-station:hover .cl-popover { opacity: 1; transform: scale(1); pointer-events: auto; }

    .cl-pop-meta { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
    .cl-pop-ver { font-size: 10px; font-weight: 700; font-family: 'SF Mono', 'Menlo', monospace; color: var(--cl-text-dim); }
    .cl-pop-date { font-size: 10px; color: var(--cl-text-muted); }
    .cl-pop-tag {
      font-size: 8px; font-weight: 700;
      letter-spacing: 0.1em; text-transform: uppercase;
      padding: 2px 7px; border-radius: 100px;
    }
    .cl-pop-tag.cl-t-ava      { background: ${rgba(CAT_COLORS.ava, 0.12)};      color: ${CAT_COLORS.ava};      border: 1px solid ${rgba(CAT_COLORS.ava, 0.22)}; }
    .cl-pop-tag.cl-t-intel    { background: ${rgba(CAT_COLORS.intel, 0.12)};    color: ${CAT_COLORS.intel};    border: 1px solid ${rgba(CAT_COLORS.intel, 0.22)}; }
    .cl-pop-tag.cl-t-platform { background: ${rgba(CAT_COLORS.platform, 0.12)}; color: ${CAT_COLORS.platform}; border: 1px solid ${rgba(CAT_COLORS.platform, 0.22)}; }
    .cl-pop-tag.cl-t-pulse    { background: ${rgba(CAT_COLORS.pulse, 0.12)};    color: ${CAT_COLORS.pulse};    border: 1px solid ${rgba(CAT_COLORS.pulse, 0.22)}; }

    .cl-popover h4 {
      font-family: 'DM Serif Display', serif; font-weight: 400;
      font-size: 15px; color: var(--cl-head);
      margin: 2px 0 4px; line-height: 1.2;
    }
    .cl-popover p {
      font-size: 12px; color: var(--cl-text-dim);
      line-height: 1.55; margin: 0;
    }

    /* Quadrant labels */
    .cl-quad-label {
      position: absolute;
      font-size: 9.5px; font-weight: 700;
      letter-spacing: 0.18em; text-transform: uppercase;
      pointer-events: none; z-index: 5;
      transform: translate(-50%, -50%);
      opacity: 0.4;
    }

    /* Center hub */
    .cl-center-hub {
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      z-index: 20;
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      pointer-events: none;
    }
    .cl-logo-wrap {
      position: relative; width: 46px; height: 46px;
      animation: cl-logo-float 4.2s ease-in-out infinite;
      transform-style: preserve-3d;
      filter:
        drop-shadow(0 0 16px ${rgba(C.blue, 0.5)})
        drop-shadow(0 0 40px ${rgba(C.blueGlow, 0.22)});
    }
    .cl-theme-light .cl-logo-wrap {
      filter:
        drop-shadow(0 0 10px ${rgba(C.blue, 0.22)})
        drop-shadow(0 0 26px ${rgba(C.blueGlow, 0.08)});
    }
    .cl-center-label {
      font-size: 8.5px; font-weight: 700;
      letter-spacing: 0.16em; text-transform: uppercase;
      color: var(--cl-text-muted);
      white-space: nowrap;
    }
    .cl-theme-dark .cl-center-label {
      text-shadow: 0 0 16px ${rgba(C.blueGlow, 0.3)};
    }
    @keyframes cl-logo-float {
      0%,100% { transform: translateY(0) translateZ(0); }
      50%     { transform: translateY(-3px) translateZ(8px); }
    }

    /* Particles */
    .cl-particle-canvas {
      position: absolute; inset: 0;
      pointer-events: none; overflow: hidden; z-index: 1;
    }
    .cl-particle {
      position: absolute; border-radius: 50%;
      animation: cl-particle-drift linear infinite;
    }
    @keyframes cl-particle-drift {
      0%   { transform: translateY(0) translateX(0); opacity: 0; }
      10%  { opacity: 1; }
      90%  { opacity: 1; }
      100% { transform: translateY(-220px) translateX(40px); opacity: 0; }
    }

    /* Pulse trails rendered into pulse-group by JS — inherit currentColor isn't needed */
    .cl-pulse-group circle { pointer-events: none; }

    /* ─── Responsive ─── */
    @media (max-width: 820px) {
      .cl-legend { gap: 18px; }
      .cl-quad-label { font-size: 8.5px; letter-spacing: 0.14em; }
    }
    @media (max-width: 620px) {
      .cl-root { padding: 56px 16px 44px !important; }
      .cl-hero { margin-bottom: 20px; }
      .cl-popover { width: 220px; padding: 12px 14px; }
      .cl-popover h4 { font-size: 14px; }
      .cl-popover p { font-size: 11px; }
      .cl-s-label { font-size: 8px; }
      .cl-station { width: 11px; height: 11px; border-width: 2px; }
      .cl-quad-label { font-size: 8px; letter-spacing: 0.12em; }
      .cl-legend { gap: 14px; padding-bottom: 14px; }
      .cl-legend-item { font-size: 10px; }
    }
    @media (max-width: 440px) {
      .cl-popover { width: 180px; }
      .cl-pop-meta { gap: 4px; }
    }
    @media (hover: none) {
      /* Disable 3D tilt on touch — reset any inline transform */
      .cl-map-viewport { transform: none !important; }
    }
    @media (prefers-reduced-motion: reduce) {
      .cl-line-main, .cl-line-glass, .cl-line-specular { animation: none !important; stroke-dashoffset: 0 !important; }
      .cl-line-glow { animation: none !important; }
      .cl-line-roadmap .cl-line-main { animation: none !important; stroke-opacity: 0.45 !important; }
      .cl-station { animation: none !important; opacity: 1 !important; }
      .cl-map-viewport::before { animation: none !important; }
      .cl-logo-wrap { animation: none !important; }
      .cl-particle { display: none; }
    }
  `;
  return <style>{css}</style>;
};
