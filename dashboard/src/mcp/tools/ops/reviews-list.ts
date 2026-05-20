import { z } from "zod";
import type { ToolContext, ToolResult } from "../../types";
import type { Review } from "@/types/reviews";

export const inputSchema = z.object({
  limit: z.number().int().min(1).max(200).default(25)
    .describe("Max reviews to return. Default 25."),
  platform: z.enum(["google", "trustpilot", "nps_sms"]).optional()
    .describe("Filter to a single platform. Omit for all."),
}).strict();

export type Input = z.infer<typeof inputSchema>;

interface Data {
  clinicId: string;
  count: number;
  platformBreakdown: Record<string, number>;
  averageRating: number | null;
  reviews: Array<Review & { id: string }>;
}

export async function run(ctx: ToolContext, input: Input): Promise<ToolResult<Data>> {
  let query = ctx.db
    .collection(`clinics/${ctx.clinicId}/reviews`)
    .orderBy("date", "desc")
    .limit(input.limit);

  if (input.platform) {
    query = ctx.db
      .collection(`clinics/${ctx.clinicId}/reviews`)
      .where("platform", "==", input.platform)
      .orderBy("date", "desc")
      .limit(input.limit);
  }

  const snap = await query.get();
  const reviews = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Review, "id">) }));

  const platformBreakdown: Record<string, number> = {};
  let ratingSum = 0;
  let ratingCount = 0;
  for (const r of reviews) {
    platformBreakdown[r.platform] = (platformBreakdown[r.platform] ?? 0) + 1;
    if (typeof r.rating === "number" && Number.isFinite(r.rating)) {
      ratingSum += r.rating;
      ratingCount++;
    }
  }
  const averageRating = ratingCount > 0 ? ratingSum / ratingCount : null;

  const summary =
    reviews.length === 0
      ? "No reviews found."
      : `${reviews.length} reviews — avg rating ${averageRating?.toFixed(2) ?? "?"} across ${Object.keys(platformBreakdown).length} platform(s).`;

  return { data: { clinicId: ctx.clinicId, count: reviews.length, platformBreakdown, averageRating, reviews }, summary };
}
