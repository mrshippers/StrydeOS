/**
 * Cursor-based pagination helper for Firestore queries.
 *
 * Usage:
 *   const page = await paginateQuery(
 *     db.collection(`clinics/${clinicId}/comms_log`).orderBy("sentAt", "desc"),
 *     { pageSize: 25, cursor: request.nextPageUrl?.searchParams.get("cursor") }
 *   );
 *   // page.docs, page.nextCursor, page.hasMore
 */

import type { Query, DocumentSnapshot } from "firebase-admin/firestore";

export interface PaginationOptions {
  pageSize: number;
  /** Base64-encoded document path from a previous response's `nextCursor`. */
  cursor?: string | null;
}

export interface PaginatedResult<T> {
  docs: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Executes a Firestore query with cursor-based pagination.
 *
 * @param query - A Firestore query with .orderBy() already applied.
 * @param opts  - pageSize and optional cursor from previous page.
 * @returns Paginated result with docs, nextCursor, and hasMore flag.
 */
export async function paginateQuery<T = FirebaseFirestore.DocumentData>(
  query: Query,
  opts: PaginationOptions
): Promise<PaginatedResult<T & { id: string }>> {
  const { pageSize, cursor } = opts;

  let q = query.limit(pageSize + 1); // Fetch one extra to detect hasMore

  if (cursor) {
    const docPath = Buffer.from(cursor, "base64url").toString("utf-8");
    const snap = await query.firestore.doc(docPath).get();
    if (snap.exists) {
      q = q.startAfter(snap);
    }
  }

  const snapshot = await q.get();
  const hasMore = snapshot.docs.length > pageSize;
  const docs = snapshot.docs.slice(0, pageSize);

  const lastDoc = docs[docs.length - 1] as DocumentSnapshot | undefined;
  const nextCursor = hasMore && lastDoc
    ? Buffer.from(lastDoc.ref.path, "utf-8").toString("base64url")
    : null;

  return {
    docs: docs.map((d) => ({ id: d.id, ...(d.data() as T) })),
    nextCursor,
    hasMore,
  };
}
