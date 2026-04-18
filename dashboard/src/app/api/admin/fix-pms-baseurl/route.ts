import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

// One-shot admin fix — delete this route after use
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  if (secret !== process.env.ELEVENLABS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getAdminDb();
  const ref = db.collection("clinics").doc("clinic-spires")
    .collection("integrations_config").doc("pms");

  const before = await ref.get();
  const beforeData = before.data();

  await ref.update({ baseUrl: "https://app.writeupp.com/api/v1" });

  const after = await ref.get();
  return NextResponse.json({
    before: { baseUrl: beforeData?.baseUrl, provider: beforeData?.provider },
    after: { baseUrl: after.data()?.baseUrl, provider: after.data()?.provider },
  });
}
