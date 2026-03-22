/**
 * Subject Access Request (SAR) API
 *
 * POST /api/compliance/sar - Create a new SAR
 * GET /api/compliance/sar - List all SARs for the clinic
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyApiRequest, requireRole, handleApiError } from "@/lib/auth-guard";
import { getAdminDb } from "@/lib/firebase-admin";
import type { SarRequest } from "@/types";
import { withRequestLog } from "@/lib/request-logger";

async function postHandler(request: NextRequest) {
  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin"]);

    const clinicId = user.clinicId;
    if (!clinicId) {
      return NextResponse.json({ error: "No clinic" }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.type || !body.requestedBy || !body.description) {
      return NextResponse.json(
        { error: "type, requestedBy, and description are required" },
        { status: 400 }
      );
    }

    const { type, requestedBy, patientId, description } = body as {
      type: "access" | "correction" | "deletion";
      requestedBy: string;
      patientId?: string;
      description: string;
    };

    if (!["access", "correction", "deletion"].includes(type)) {
      return NextResponse.json({ error: "Invalid SAR type" }, { status: 400 });
    }

    const db = getAdminDb();
    const now = new Date().toISOString();
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 30);

    const sarData: Omit<SarRequest, "id"> = {
      type,
      status: "pending",
      requestedBy,
      patientId,
      description,
      responseDeadline: deadline.toISOString(),
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db
      .collection("clinics")
      .doc(clinicId)
      .collection("sar_requests")
      .add(sarData);

    return NextResponse.json(
      { id: docRef.id, ...sarData },
      { status: 201 }
    );
  } catch (e) {
    return handleApiError(e);
  }
}

async function getHandler(request: NextRequest) {
  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);

    const clinicId = user.clinicId;
    if (!clinicId && user.role !== "superadmin") {
      return NextResponse.json({ error: "No clinic" }, { status: 400 });
    }

    const db = getAdminDb();
    const snapshot = await db
      .collection("clinics")
      .doc(clinicId)
      .collection("sar_requests")
      .orderBy("createdAt", "desc")
      .get();

    const requests: SarRequest[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as SarRequest[];

    return NextResponse.json({ requests });
  } catch (e) {
    return handleApiError(e);
  }
}

export const POST = withRequestLog(postHandler);
export const GET = withRequestLog(getHandler);
