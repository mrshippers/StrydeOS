import type { CSVSchema, CanonicalField } from "./types";
import type { AppointmentStatus } from "@/types";

// ─── WriteUpp ────────────────────────────────────────────────────────────────
// Every alias from the original COL object is preserved as a separate key.

const WRITEUPP_FIELD_MAP: Record<string, CanonicalField> = {
  "Appointment Date": "date",
  "Date": "date",
  "appointment_date": "date",
  "Start Date": "date",
  "Start": "date",

  "Appointment Time": "time",
  "Time": "time",
  "Start Time": "time",
  "appointment_time": "time",

  "End Date": "endDate",
  "End": "endDate",

  "End Time": "endTime",

  "Patient ID": "patientId",
  "Patient Id": "patientId",
  "PatientID": "patientId",
  "patient_id": "patientId",
  "WUID": "patientId",
  "Client ID": "patientId",

  "Patient First Name": "patientFirst",
  "First Name": "patientFirst",
  "patient_first_name": "patientFirst",
  "Client First Name": "patientFirst",

  "Patient Last Name": "patientLast",
  "Last Name": "patientLast",
  "patient_last_name": "patientLast",
  "Surname": "patientLast",
  "Client Last Name": "patientLast",

  "Patient Email": "patientEmail",
  "Email": "patientEmail",
  "patient_email": "patientEmail",
  "Client Email": "patientEmail",

  "Patient Phone": "patientPhone",
  "Phone": "patientPhone",
  "patient_phone": "patientPhone",
  "Mobile": "patientPhone",
  "Client Phone": "patientPhone",

  "Date of Birth": "patientDob",
  "DOB": "patientDob",
  "dob": "patientDob",
  "Patient DOB": "patientDob",

  "Practitioner": "practitioner",
  "Clinician": "practitioner",
  "Provider": "practitioner",
  "Staff": "practitioner",
  "Assigned To": "practitioner",
  "Therapist": "practitioner",

  "Practitioner ID": "practitionerId",
  "Clinician ID": "practitionerId",
  "Staff ID": "practitionerId",
  "practitioner_id": "practitionerId",

  "Appointment Type": "type",
  "Service": "type",
  "Type": "type",
  "Treatment Type": "type",
  "appointment_type": "type",

  "Status": "status",
  "Appointment Status": "status",
  "attendance_status": "status",

  "Notes": "notes",
  "note": "notes",
  "Internal Notes": "notes",

  "Price": "price",
  "Amount": "price",
  "Fee": "price",
  "Cost": "price",
  "Net Amount": "price",

  "Duration": "duration",
  "Duration (mins)": "duration",
  "duration_minutes": "duration",
};

const WRITEUPP_STATUS_MAP: Record<string, AppointmentStatus> = {
  confirmed: "scheduled",
  booked: "scheduled",
  attended: "completed",
  "did not attend": "dna",
  dna: "dna",
  cancelled: "cancelled",
  "late cancellation": "late_cancel",
  "late cancel": "late_cancel",
  no_show: "dna",
};

const writeuppSchema: CSVSchema = {
  id: "writeupp",
  provider: "WriteUpp",
  version: "2026-03",
  fileType: "both",
  fieldMap: WRITEUPP_FIELD_MAP,
  dateFormat: "uk",
  statusMap: WRITEUPP_STATUS_MAP,
  requiredFields: ["date", "practitioner", "status"],
  priority: 10,
};

// ─── Cliniko ─────────────────────────────────────────────────────────────────

const CLINIKO_FIELD_MAP: Record<string, CanonicalField> = {
  "starts_at": "date",
  "ends_at": "endDate",
  "patient.first_name": "patientFirst",
  "patient.last_name": "patientLast",
  "patient.email": "patientEmail",
  "practitioner.display_name": "practitioner",
  "appointment_type.name": "type",
  "attendance": "status",
  "patient.id": "patientId",
  "id": "practitionerId",
};

const CLINIKO_STATUS_MAP: Record<string, AppointmentStatus> = {
  arrived: "completed",
  did_not_arrive: "dna",
  cancelled: "cancelled",
};

const clinikoSchema: CSVSchema = {
  id: "cliniko",
  provider: "Cliniko",
  version: "2026-03",
  fileType: "appointments",
  fieldMap: CLINIKO_FIELD_MAP,
  dateFormat: "iso",
  statusMap: CLINIKO_STATUS_MAP,
  requiredFields: ["date", "practitioner", "status"],
  priority: 20,
};

// ─── TM3 (Blue Zinc) ────────────────────────────────────────────────────────

const TM3_FIELD_MAP: Record<string, CanonicalField> = {
  "Forename": "patientFirst",
  "Surname": "patientLast",
  "Email Address": "patientEmail",
  "Therapist": "practitioner",
  "Date": "date",
  "Time": "time",
  "End Time": "endTime",
  "Type": "type",
  "Status": "status",
  "Client Ref": "patientId",
  "Amount": "price",
};

const TM3_STATUS_MAP: Record<string, AppointmentStatus> = {
  attended: "completed",
  completed: "completed",
  arrived: "completed",
  dna: "dna",
  "did not attend": "dna",
  "no show": "dna",
  cancelled: "cancelled",
  canceled: "cancelled",
  "late cancel": "late_cancel",
  "late cancellation": "late_cancel",
  booked: "scheduled",
  confirmed: "scheduled",
  rescheduled: "scheduled",
};

const tm3Schema: CSVSchema = {
  id: "tm3",
  provider: "TM3",
  version: "2026-03",
  fileType: "appointments",
  fieldMap: TM3_FIELD_MAP,
  dateFormat: "uk",
  statusMap: TM3_STATUS_MAP,
  requiredFields: ["date", "practitioner", "status"],
  priority: 30,
};

// ─── Jane App ────────────────────────────────────────────────────────────────

const JANE_FIELD_MAP: Record<string, CanonicalField> = {
  "First Name": "patientFirst",
  "Last Name": "patientLast",
  "Email": "patientEmail",
  "Practitioner": "practitioner",
  "Date": "date",
  "Start Time": "time",
  "End Time": "endTime",
  "Service": "type",
  "Status": "status",
  "Patient #": "patientId",
  "Amount": "price",
};

const JANE_STATUS_MAP: Record<string, AppointmentStatus> = {
  arrived: "completed",
  "no show": "dna",
  cancelled: "cancelled",
  "late cancellation": "late_cancel",
};

const janeSchema: CSVSchema = {
  id: "jane",
  provider: "Jane App",
  version: "2026-03",
  fileType: "appointments",
  fieldMap: JANE_FIELD_MAP,
  dateFormat: "iso",
  statusMap: JANE_STATUS_MAP,
  requiredFields: ["date", "practitioner", "status"],
  priority: 40,
};

// ─── Exports ─────────────────────────────────────────────────────────────────

export const BUILTIN_SCHEMAS: CSVSchema[] = [
  writeuppSchema,
  clinikoSchema,
  tm3Schema,
  janeSchema,
];

export function getSchemaById(id: string): CSVSchema | undefined {
  return BUILTIN_SCHEMAS.find((s) => s.id === id);
}
