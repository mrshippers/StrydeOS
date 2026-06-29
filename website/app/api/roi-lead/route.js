// ROI calculator lead capture.
// Emails the breakdown to the prospect and notifies the team so an unconverted
// visitor still becomes a follow-up, not a lost slider-play.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const gbp = (n) => "£" + Number(n || 0).toLocaleString("en-GB");
const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function prospectHtml(results) {
  const row = (label, val) =>
    `<tr><td style="padding:11px 0;border-bottom:1px solid rgba(255,255,255,0.07);color:rgba(255,255,255,0.55);font-size:14px">${esc(label)}</td><td style="padding:11px 0;border-bottom:1px solid rgba(255,255,255,0.07);text-align:right;font-weight:700;color:#FFFFFF;font-size:14px">${esc(val)}</td></tr>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet"><title>StrydeOS</title></head>
  <body style="margin:0;padding:0;background:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
  <div style="padding:56px 32px 12px;text-align:center;background:linear-gradient(180deg,#0B2545 0%,#132D5E 100%)">
    <p style="margin:0 0 16px;font-size:11px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#4B8BF5">StrydeOS &middot; Ava</p>
    <h1 style="margin:0 0 14px;font-family:'DM Serif Display',Georgia,serif;font-size:34px;font-weight:400;line-height:1.15;color:#FFFFFF">What missed calls are costing you</h1>
    <p style="margin:0 auto;max-width:460px;font-size:15px;color:rgba(255,255,255,0.65);line-height:1.6">Based on the numbers you entered, here is what Ava puts back on the table each month.</p>
  </div>
  <div style="padding:0 32px;background:linear-gradient(180deg,#132D5E 0%,#0B2545 100%)">
    <div style="max-width:480px;margin:0 auto">
      <div style="background:rgba(75,139,245,0.10);border:1px solid rgba(75,139,245,0.28);border-radius:16px;padding:28px 24px;margin:8px 0;text-align:center">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;color:#4B8BF5;margin-bottom:10px">RECOVERED EVERY MONTH</div>
        <div style="font-family:'DM Serif Display',Georgia,serif;font-size:54px;color:#FFFFFF;line-height:1">${gbp(results.recoveredRevenueMo)}</div>
        <div style="color:rgba(255,255,255,0.6);font-size:13px;margin-top:10px">${gbp(results.recoveredRevenueYr)} a year &middot; about ${esc(results.recoveredPatientsMo)} new patients you're currently losing</div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin:6px 0">
        ${row("Ava costs", gbp(results.avaCost) + "/mo")}
        ${row("Net gain", gbp(results.netGain) + "/mo")}
        ${row("Return on Ava", Number(results.roi).toFixed(1) + "×")}
        ${row("Pays for itself in", results.paybackDays + " day" + (results.paybackDays === 1 ? "" : "s"))}
      </table>
    </div>
  </div>
  <div style="padding:28px 32px 44px;text-align:center;background:linear-gradient(180deg,#0B2545 0%,#132D5E 100%)">
    <a href="https://portal.strydeos.com/trial?src=roi-email" style="display:inline-block;padding:14px 36px;border-radius:50px;background:#1C54F2;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none">Start your free trial &rarr;</a>
    <p style="margin:18px auto 0;max-width:420px;color:rgba(255,255,255,0.42);font-size:12px;line-height:1.6">A conservative estimate, not a guarantee. No lock-in, cancel any time.</p>
  </div>
  <div style="padding:22px 32px 30px;text-align:center;background:#0B2545;border-top:1px solid rgba(255,255,255,0.04)">
    <p style="margin:0 0 6px;font-size:11px;color:rgba(255,255,255,0.25)">StrydeOS &middot; The Clinic OS for private practice</p>
    <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25)">strydeos.com</p>
  </div>
  </body></html>`;
}

function notifyHtml(email, inputs, results) {
  const line = (k, v) => `<div style="font-size:13px;color:#111827;margin:2px 0"><b>${esc(k)}:</b> ${esc(v)}</div>`;
  return `<div style="font-family:Helvetica,Arial,sans-serif;max-width:520px">
    <h2 style="color:#0B2545;font-size:18px;margin:0 0 12px">New ROI calculator lead</h2>
    ${line("Email", email)}
    <hr style="border:none;border-top:1px solid #E2DFDA;margin:12px 0"/>
    ${line("Calls/week", inputs.calls)}
    ${line("Missed %", inputs.missedPct + "%")}
    ${line("Convert %", inputs.convPct + "%")}
    ${line("New-patient value", gbp(inputs.value))}
    ${line("Service spend", gbp(inputs.serviceSpend))}
    ${line("Tier", inputs.tier)}
    <hr style="border:none;border-top:1px solid #E2DFDA;margin:12px 0"/>
    ${line("Recovered/mo", gbp(results.recoveredRevenueMo))}
    ${line("Recovered/yr", gbp(results.recoveredRevenueYr))}
    ${line("Net gain/mo", gbp(results.netGain))}
    ${line("ROI", Number(results.roi).toFixed(1) + "×")}
  </div>`;
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad request" }, { status: 400 });
  }

  const { email, inputs = {}, results = {} } = body || {};
  if (!email || !EMAIL_RE.test(email)) {
    return Response.json({ ok: false, error: "invalid email" }, { status: 400 });
  }

  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "StrydeOS <hello@strydeos.com>";
  const notify = process.env.NOTIFY_EMAIL || "jamal@strydeos.com";

  if (!key) {
    console.error("[roi-lead] RESEND_API_KEY missing - lead not captured:", email);
    return Response.json({ ok: false, error: "mailer unavailable" }, { status: 500 });
  }

  const send = (to, subject, html, reply) =>
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html, ...(reply ? { reply_to: reply } : {}) }),
    });

  try {
    // The prospect copy is the promise we made ("email it"); the notify copy is the
    // follow-up trigger. Treat the prospect send as the success signal.
    const [pRes] = await Promise.all([
      send(email, "What missed calls are costing your clinic", prospectHtml(results), notify),
      send(notify, `ROI lead: ${email}`, notifyHtml(email, inputs, results)).catch((e) => {
        console.error("[roi-lead] notify send failed:", e);
        return { ok: true };
      }),
    ]);

    if (!pRes.ok) {
      const t = await pRes.text().catch(() => "");
      console.error("[roi-lead] resend error:", pRes.status, t);
      return Response.json({ ok: false, error: "send failed" }, { status: 502 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[roi-lead] unexpected:", e);
    return Response.json({ ok: false, error: "server error" }, { status: 500 });
  }
}
