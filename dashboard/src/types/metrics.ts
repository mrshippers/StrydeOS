export interface WeeklyStats {
  id: string;
  clinicianId: string;
  clinicianName: string;
  weekStart: string;
  followUpRate: number;
  followUpTarget: number;
  hepComplianceRate: number;
  hepRate: number;
  hepTarget: number;
  utilisationRate: number;
  dnaRate: number;
  treatmentCompletionRate: number;
  revenuePerSessionPence: number;
  appointmentsTotal: number;
  initialAssessments: number;
  followUps: number;
  npsScore?: number;
  reviewCount?: number;
  avgRating?: number;
  reviewVelocity?: number;
  dnaByDayOfWeek?: Record<string, number>;
  dnaByTimeSlot?: Record<string, number>;
  computedAt?: string;
  statisticallyRepresentative?: boolean;
  caveatNote?: string;
  /** Revenue breakdown by appointment type (IA, follow-up, review, discharge) in pence */
  revenueByAppointmentType?: Record<string, number>;
  /** Revenue from insured patients in pence */
  insuranceRevenuePence?: number;
  /** Revenue from self-pay patients in pence */
  selfPayRevenuePence?: number;
}
