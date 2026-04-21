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

    // Generate a password reset link (acts as an invite link for new users).
    // Isolated try/catch so we can surface Firebase's specific auth/* error
    // codes rather than falling through to a generic 500.
    const continueUrl = `${process.env.APP_URL?.replace(/\/$/, "") ?? "https://portal.strydeos.com"}/login`;
    let link: string;
    try {
      link = await adminAuth.generatePasswordResetLink(email, { url: continueUrl });
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      console.error("[resend-invite] generatePasswordResetLink failed:", {
        code: e.code,
        message: e.message,
        email,
        continueUrl,
      });

      switch (e.code) {
        case "auth/email-not-found":
        case "auth/user-not-found":
          return NextResponse.json(
            { error: "No Firebase Auth account exists for this email. Re-add the clinician from the Add Clinician button." },
            { status: 404 },
          );
        case "auth/invalid-continue-uri":
        case "auth/unauthorized-continue-uri":
        case "auth/missing-continue-uri":
          return NextResponse.json(
            { error: `Invite link can't be generated: ${continueUrl} is not authorized in Firebase → Auth → Settings → Authorized domains. Add the domain and retry.` },
            { status: 500 },
          );
        case "auth/user-disabled":
          return NextResponse.json(
            { error: "This account is disabled. Re-enable it in Firebase Auth before resending the invite." },
            { status: 400 },
          );
        default:
          return NextResponse.json(
            {
              error: "Couldn't generate the invite link. The error has been logged — try again, or contact support if it keeps happening.",
              code: "INVITE_LINK_UNKNOWN",
            },
            { status: 500 },
          );
      }
    }

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
          return NextResponse.json(
            {
              error: "Email provider rejected the request — try again in a moment.",
              code: "EMAIL_PROVIDER_REJECTED",
            },
            { status: 502 },
          );
        }

        return NextResponse.json({ sent: true });
      } catch (emailErr) {
        console.error("[resend-invite] Email send failed:", emailErr);
        return NextResponse.json(
          {
            error: "Email provider rejected the request — try again in a moment.",
            code: "EMAIL_PROVIDER_REJECTED",
          },
          { status: 502 },
        );
      }
    }

    // No email provider configured — do not return the link in the response body
    return NextResponse.json({ sent: false, note: "Configure RESEND_API_KEY to send invite emails automatically." });
  } catch (err: unknown) {
    console.error("[resend-invite] Error:", err);
    return handleApiError(err);
  }
}

export const POST = withRequestLog(handler);
