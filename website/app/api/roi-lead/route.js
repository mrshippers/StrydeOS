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
    `<tr><td style="padding:8px 0;color:#6B7280;font-size:14px">${esc(label)}</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#0B2545;font-size:14px">${esc(val)}</td></tr>`;
  return `<!doctype html><html><body style="margin:0;background:#FAF9F7;font-family:'Outfit',Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="font-size:12px;font-weight:700;letter-spacing:0.14em;color:#1C54F2;margin-bottom:8px">STRYDEOS · AVA</div>
    <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:30px;color:#0B2545;margin:0 0 6px">What missed calls are costing you</h1>
    <p style="color:#6B7280;font-size:15px;line-height:1.55;margin:0 0 22px">Based on the numbers you entered, here is what Ava recovers each month.</p>
    <div style="background:#0B2545;border-radius:16px;padding:24px;margin-bottom:20px">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;color:#4B8BF5;margin-bottom:8px">RECOVERED EVERY MONTH</div>
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:48px;color:#fff;line-height:1">${gbp(results.recoveredRevenueMo)}</div>
      <div style="color:rgba(255,255,255,0.6);font-size:13px;margin-top:6px">${gbp(results.recoveredRevenueYr)} a year · ~${esc(results.recoveredPatientsMo)} new patients you're currently losing</div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      ${row("Ava costs", gbp(results.avaCost) + "/mo")}
      ${row("Net gain", gbp(results.netGain) + "/mo")}
      ${row("Return on Ava", Number(results.roi).toFixed(1) + "×")}
      ${row("Pays for itself in", results.paybackDays + " day" + (results.paybackDays === 1 ? "" : "s"))}
    </table>
    <a href="https://portal.strydeos.com/trial?src=roi-email" style="display:block;text-align:center;padding:15px 28px;border-radius:50px;background:#1C54F2;color:#fff;text-decoration:none;font-weight:700;font-size:15px">Start your free trial →</a>
    <p style="color:#9CA3AF;font-size:12px;line-height:1.6;margin:22px 0 0;text-align:center">Conservative estimate, not a guarantee. No setup fee, no lock-in, cancel any time.<br/>StrydeOS · strydeos.com</p>
  </div></body></html>`;
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
    console.error("[roi-lead] RESEND_API_KEY missing — lead not captured:", email);
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
