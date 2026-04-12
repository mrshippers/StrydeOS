import { NextRequest, NextResponse } from "next/server";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, requireRole, handleApiError } from "@/lib/auth-guard";
import { withRequestLog } from "@/lib/request-logger";
import { buildInviteEmail, buildInviteText } from "@/lib/intelligence/emails/invite";

/**
 * POST /api/clinic/resend-invite
 *
 * Sends a password-reset / invite email to a clinician so they can self-onboard
 * without requiring manual admin intervention.
 *
 * Body: { clinicianId: string, email: string }
 * Auth: Bearer {Firebase ID token} — must be owner, admin, or superadmin
 */
async function handler(req: NextRequest) {
  // Rate limit: 5 requests per IP per 60 seconds (async for distributed Redis enforcement)
  const { limited, remaining } = await checkRateLimitAsync(req, { limit: 5, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  try {
    const user = await verifyApiRequest(req);
    requireRole(user, ["owner", "admin", "superadmin"]);

    let body: { clinicianId?: string; email?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    const db = getAdminDb();
    const adminAuth = getAdminAuth();

    // Tenant isolation: verify target email belongs to a user in the caller's clinic
    const targetUserSnap = await db
      .collection("users")
      .where("email", "==", email)
      .where("clinicId", "==", user.clinicId)
      .limit(1)
      .get();

    if (targetUserSnap.empty) {
      return NextResponse.json(
        { error: "Target user not found in your clinic" },
        { status: 403 },
      );
    }

    // Generate a password reset link (acts as an invite link for new users)
    const link = await adminAuth.generatePasswordResetLink(email, {
      url: `${process.env.APP_URL ?? "https://portal.strydeos.com"}/login`,
    });

    // If RESEND_API_KEY is configured, send the email
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "StrydeOS <noreply@strydeos.com>",
            to: [email],
            subject: "Your StrydeOS invite — set your password to get started",
            html: buildInviteEmail(link),
            text: buildInviteText(link),
          }),
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => "unknown");
          console.error("[resend-invite] Resend API returned error:", res.status, errBody);
          return NextResponse.json({ sent: false, note: "Email provider returned an error." });
        }

        return NextResponse.json({ sent: true });
      } catch (emailErr) {
        console.error("[resend-invite] Email send failed:", emailErr);
        // Fall through — return sent: false
      }
    }

    // No email provider configured — do not return the link in the response body
    return NextResponse.json({ sent: false, note: "Configure RESEND_API_KEY to send invite emails automatically." });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === "auth/user-not-found") {
      return NextResponse.json(
        { error: `No account found for this email. Ask admin to create their account first.` },
        { status: 404 }
      );
    }
    console.error("[resend-invite] Error:", err);
    return handleApiError(err);
  }
}

export const POST = withRequestLog(handler);
