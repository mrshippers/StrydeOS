export type ReviewPlatform = "google" | "trustpilot" | "nps_sms";

export interface Review {
  id: string;
  platform: ReviewPlatform;
  rating: number;
  reviewText?: string;
  date: string;
  /** Treating clinician resolved from patient record (NPS SMS). */
  clinicianId?: string;
  /** Clinician name-matched from review text (Google/Trustpilot). */
  clinicianMentioned?: string;
  patientId?: string;
  verified: boolean;
}
