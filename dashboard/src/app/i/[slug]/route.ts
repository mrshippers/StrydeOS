/**
 * GET /i/[slug]
 *
 * Public short-link resolver. Maps a short slug to the full signed intake token
 * and 302-redirects to /intake/[token]. Keeps SMS links short and clickable.
 * Server-only Firestore read (Admin SDK); the slug doc is never client-readable.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

const SHORTLINKS = "intake_shortlinks";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const origin = request.nextUrl.origin;

  try {
    const snap = await getAdminDb().collection(SHORTLINKS).doc(slug).get();
    const data = snap.data();
    if (!data?.token) {
      return NextResponse.redirect(new URL("/intake/expired", origin));
    }
    if (data.expiresAt && new Date(data.expiresAt).getTime() < Date.now()) {
      return NextResponse.redirect(new URL("/intake/expired", origin));
    }
    return NextResponse.redirect(new URL(`/intake/${data.token}`, origin));
  } catch {
    return NextResponse.redirect(new URL("/intake/expired", origin));
  }
}
