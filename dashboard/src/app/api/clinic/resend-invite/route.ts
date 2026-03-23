import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { withRequestLog } from "@/lib/request-logger";

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
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let callerUid: string;

  try {
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(token);
    callerUid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

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

  try {
    const db = getAdminDb();
    const adminAuth = getAdminAuth();

    // Verify caller is owner/admin/superadmin
    const callerSnap = await db.collection("users").doc(callerUid).get();
    if (!callerSnap.exists) {
      return NextResponse.json({ error: "Caller not found" }, { status: 403 });
    }
    const callerData = callerSnap.data() as { role?: string };
    if (!["owner", "admin", "superadmin"].includes(callerData.role ?? "")) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Generate a password reset link (acts as an invite link for new users)
    const link = await adminAuth.generatePasswordResetLink(email, {
      url: `${process.env.APP_URL ?? "https://app.strydeos.com"}/login`,
    });

    // If RESEND_API_KEY is configured, send the email
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "StrydeOS <noreply@strydeos.com>",
            to: [email],
            subject: "Your StrydeOS invite — set your password to get started",
            html: `
              <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
                <h2 style="color: #0B2545; margin-bottom: 8px;">Welcome to StrydeOS</h2>
                <p style="color: #6B7280; margin-bottom: 24px;">
                  You've been invited to join your clinic on StrydeOS — the clinical 
                  operating system built for high-performance physiotherapy practices.
                </p>
                <a href="${link}" style="display: inline-block; background: #1C54F2; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
                  Set your password &amp; sign in
                </a>
                <p style="color: #9CA3AF; font-size: 12px; margin-top: 24px;">
                  This link expires in 1 hour. If you weren't expecting this email, you can safely ignore it.
                </p>
              </div>
            `,
          }),
        });
        return NextResponse.json({ sent: true });
      } catch (emailErr) {
        console.error("[resend-invite] Email send failed:", emailErr);
        // Fall through — return the link anyway
      }
    }

    // No email provider configured — do not return the link in the response body
    return NextResponse.json({ sent: false, note: "Configure RESEND_API_KEY to send invite emails automatically." });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === "auth/user-not-found") {
      return NextResponse.json(
        { error: `No account found for ${email}. Ask admin to create their account first.` },
        { status: 404 }
      );
    }
    console.error("[resend-invite] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const POST = withRequestLog(handler);
