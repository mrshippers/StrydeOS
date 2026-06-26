"use client";

/**
 * Patient-facing insurance intake form (public, token-gated, chromeless).
 *
 * Typed only — no photo, no upload. Insurer is a dropdown bound to the tenant's
 * options when available, otherwise a free-typed field. Consent is mandatory.
 * On submit the details land in the clinic's review queue (never written to the
 * PMS directly from here).
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ShieldCheck, Loader2, AlertCircle, Lock, MapPin, Search } from "lucide-react";
import { brand } from "@/lib/brand";
import MonolithPulse from "@/components/ui/MonolithPulse";
import { DocumentMark } from "@/components/ui/ModuleIcons";
import { INSURERS } from "@/lib/insurance/appointment-classifier";

interface IntakeMeta {
  clinicName: string;
  /** Clinic's own logo (clinic.brandConfig.logo); falls back to a generic mark when unset. */
  clinicLogoUrl: string | null;
  insurerOptions: string[];
  /** Insurer derived from the booked appointment type; when set the field locks. */
  derivedInsurer: string | null;
  status: "issued" | "submitted";
  consentVersion: string;
}

/** A selectable address returned by the getAddress.io proxy. */
interface AddressOption {
  line1: string;
  line2: string;
  town: string;
  county: string;
  postcode: string;
  label: string;
}

type Phase = "loading" | "form" | "submitted" | "done" | "error";

export default function InsuranceIntakePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [phase, setPhase] = useState<Phase>("loading");
  const [meta, setMeta] = useState<IntakeMeta | null>(null);
  const [loadError, setLoadError] = useState<string>("");

  const [insurerName, setInsurerName] = useState("");
  // Insurer-mismatch safety net: when the insurer is locked from the booking,
  // the patient can flag a different insurer without overwriting the derived one.
  const [claimingMismatch, setClaimingMismatch] = useState(false);
  const [patientClaimedInsurer, setPatientClaimedInsurer] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [authorisationCode, setAuthorisationCode] = useState("");
  const [claimReference, setClaimReference] = useState("");
  const [excess, setExcess] = useState("");
  const [consent, setConsent] = useState(false);

  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [town, setTown] = useState("");
  const [county, setCounty] = useState("");
  const [postcode, setPostcode] = useState("");
  const [country, setCountry] = useState("United Kingdom");
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupMsg, setLookupMsg] = useState("");
  const [addressOptions, setAddressOptions] = useState<AddressOption[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Postcode -> full-address lookup via getAddress.io (server-proxied so the API
  // key is never exposed to the public form). Returns selectable street addresses,
  // unlike the old postcodes.io call which could only fill the broad area.
  async function lookupPostcode() {
    const pc = postcode.trim();
    if (!pc) {
      setLookupMsg("Enter a postcode first.");
      return;
    }
    setLookingUp(true);
    setLookupMsg("");
    setAddressOptions([]);
    try {
      const res = await fetch(`/api/intake/${token}/address-lookup?postcode=${encodeURIComponent(pc)}`);
      if (res.status === 503) {
        setLookupMsg("Address lookup is not available right now — please type your address below.");
        return;
      }
      if (!res.ok) {
        setLookupMsg("Postcode not found — please check it, or type your address below.");
        return;
      }
      const data = await res.json();
      const list: AddressOption[] = data.addresses ?? [];
      if (list.length === 0) {
        setLookupMsg("No addresses found for that postcode — please type yours below.");
        return;
      }
      setAddressOptions(list);
      if (data.postcode) setPostcode(String(data.postcode).toUpperCase());
      setLookupMsg(`${list.length} ${list.length === 1 ? "address" : "addresses"} found — select yours.`);
    } catch {
      setLookupMsg("Could not look up that postcode.");
    } finally {
      setLookingUp(false);
    }
  }

  function selectAddress(idx: number) {
    const a = addressOptions[idx];
    if (!a) return;
    setAddressLine1(a.line1);
    setAddressLine2(a.line2);
    setTown(a.town);
    setCounty(a.county);
    if (a.postcode) setPostcode(a.postcode.toUpperCase());
    setCountry("United Kingdom");
  }

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/intake/${token}`);
        if (!res.ok) {
          setLoadError("This link is invalid or has expired. Please contact your clinic.");
          setPhase("error");
          return;
        }
        const data: IntakeMeta = await res.json();
        setMeta(data);
        // Insurer is derived from the booked appointment type — pre-fill + lock it.
        if (data.derivedInsurer) setInsurerName(data.derivedInsurer);
        setPhase(data.status === "submitted" ? "submitted" : "form");
      } catch {
        setLoadError("Something went wrong loading this form. Please try again.");
        setPhase("error");
      }
    })();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/intake/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          insurerName,
          // Only sent when the patient flagged a mismatch on a locked insurer;
          // the server keeps the derived insurer authoritative and raises a flag.
          patientClaimedInsurer:
            meta?.derivedInsurer && claimingMismatch && patientClaimedInsurer
              ? patientClaimedInsurer
              : undefined,
          policyNumber,
          authorisationCode: authorisationCode || undefined,
          claimReference: claimReference || undefined,
          excess: excess || undefined,
          addressLine1: addressLine1 || undefined,
          addressLine2: addressLine2 || undefined,
          town: town || undefined,
          county: county || undefined,
          postcode: postcode || undefined,
          country: country || undefined,
          consent,
        }),
      });
      if (res.ok) {
        setPhase("done");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setPhase("submitted");
        return;
      }
      setErrors(data.errors ?? [data.error ?? "Submission failed. Please check your details."]);
    } catch {
      setErrors(["Something went wrong. Please try again."]);
    } finally {
      setSubmitting(false);
    }
  }

  const hasOptions = (meta?.insurerOptions?.length ?? 0) > 0;
  const insurerLocked = Boolean(meta?.derivedInsurer);

  return (
    <div className="min-h-screen bg-cloud-dancer flex flex-col items-center px-5 py-10">
      <div className="w-full max-w-lg animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          {meta?.clinicLogoUrl ? (
            <img
              src={meta.clinicLogoUrl}
              alt={meta.clinicName}
              className="h-11 w-auto max-w-[150px] object-contain"
            />
          ) : (
            <div className="w-11 h-11 rounded-xl bg-blue/10 flex items-center justify-center">
              <ShieldCheck size={22} className="text-blue" />
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-widest">Insurance details</p>
            <h1 className="font-display text-[26px] text-navy leading-tight">
              {meta?.clinicName ?? "Your clinic"}
            </h1>
          </div>
        </div>

        {phase === "loading" && (
          <div className="flex items-center justify-center py-20">
            <MonolithPulse size={48} />
          </div>
        )}

        {phase === "error" && (
          <StatusCard accent={brand.danger} icon={<DocumentMark color={brand.danger} size={30} />} title="Link unavailable" body={loadError} />
        )}

        {phase === "submitted" && (
          <StatusCard
            accent={brand.success}
            icon={<DocumentMark color={brand.success} size={30} />}
            title="Already received"
            body="Your insurance details have already been submitted. There is nothing more to do."
          />
        )}

        {phase === "done" && (
          <StatusCard
            accent={brand.success}
            icon={<DocumentMark color={brand.success} size={30} />}
            title="Thank you"
            body="Your insurance details have been sent to the clinic. They will be added to your file ahead of your appointment."
          />
        )}

        {phase === "form" && (
          <form onSubmit={handleSubmit} className="rounded-2xl bg-white surface-lit border border-border p-6 shadow-sm space-y-5">
            <p className="text-sm text-muted">
              Please confirm your private insurance details below. It takes under a minute and means your
              appointment can be processed without delay.
            </p>

            {errors.length > 0 && (
              <div className="rounded-xl bg-danger/5 border border-danger/20 p-3 space-y-1">
                {errors.map((err, i) => (
                  <p key={i} className="text-sm text-danger flex items-start gap-2">
                    <AlertCircle size={15} className="mt-0.5 shrink-0" />
                    {err}
                  </p>
                ))}
              </div>
            )}

            <Field label="Insurer" required>
              {insurerLocked ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 form-input bg-cloud-light text-navy" aria-readonly>
                    <span className="font-semibold">{meta!.derivedInsurer}</span>
                    <span className="flex items-center gap-1 text-xs text-muted">
                      <Lock size={12} /> From your booking
                    </span>
                  </div>
                  {!claimingMismatch ? (
                    <button
                      type="button"
                      onClick={() => setClaimingMismatch(true)}
                      className="text-xs font-medium text-blue hover:underline"
                    >
                      Not your insurer?
                    </button>
                  ) : (
                    <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 space-y-2">
                      <p className="text-xs text-amber-700">
                        Your booking is recorded under <span className="font-semibold">{meta!.derivedInsurer}</span>.
                        Tell us your actual insurer and the clinic will check it before your appointment.
                      </p>
                      <select
                        value={patientClaimedInsurer}
                        onChange={(e) => setPatientClaimedInsurer(e.target.value)}
                        className="form-input"
                        aria-label="Your actual insurer"
                      >
                        <option value="">Select your insurer</option>
                        {INSURERS.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => { setClaimingMismatch(false); setPatientClaimedInsurer(""); }}
                        className="text-xs font-medium text-muted hover:text-navy hover:underline"
                      >
                        Cancel — my booking insurer is correct
                      </button>
                    </div>
                  )}
                </div>
              ) : hasOptions ? (
                <select
                  value={insurerName}
                  onChange={(e) => setInsurerName(e.target.value)}
                  required
                  className="form-input"
                >
                  <option value="">Select your insurer</option>
                  {meta!.insurerOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={insurerName}
                  onChange={(e) => setInsurerName(e.target.value)}
                  required
                  placeholder="e.g. Bupa"
                  className="form-input"
                />
              )}
            </Field>

            <Field label="Policy or membership number" required>
              <input
                type="text"
                value={policyNumber}
                onChange={(e) => setPolicyNumber(e.target.value)}
                required
                inputMode="text"
                autoComplete="off"
                placeholder="As shown on your insurance card"
                className="form-input font-mono"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Pre-authorisation code">
                <input type="text" value={authorisationCode} onChange={(e) => setAuthorisationCode(e.target.value)} placeholder="Optional" className="form-input font-mono" />
              </Field>
              <Field label="Claim reference">
                <input type="text" value={claimReference} onChange={(e) => setClaimReference(e.target.value)} placeholder="Optional" className="form-input font-mono" />
              </Field>
            </div>

            <Field label="Excess">
              <input type="text" value={excess} onChange={(e) => setExcess(e.target.value)} placeholder="£0" className="form-input" />
            </Field>

            <div className="pt-1">
              <div className="flex items-center gap-2 mb-3">
                <MapPin size={15} className="text-blue" />
                <span className="text-sm font-semibold text-navy">Your address</span>
              </div>

              <Field label="Postcode">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value)}
                    placeholder="e.g. NW6 1AB"
                    className="form-input uppercase"
                  />
                  <button
                    type="button"
                    onClick={lookupPostcode}
                    disabled={lookingUp}
                    className="shrink-0 flex items-center gap-1.5 px-4 rounded-xl text-sm font-semibold text-blue border border-blue/20 bg-blue/5 hover:bg-blue/10 transition-colors disabled:opacity-50"
                  >
                    {lookingUp ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    Find address
                  </button>
                </div>
              </Field>
              {lookupMsg && <p className="text-xs text-muted mt-1.5">{lookupMsg}</p>}

              {addressOptions.length > 0 && (
                <div className="mt-3">
                  <Field label="Select your address">
                    <select
                      className="form-input"
                      defaultValue=""
                      onChange={(e) => { if (e.target.value !== "") selectAddress(Number(e.target.value)); }}
                    >
                      <option value="" disabled>Choose your address</option>
                      {addressOptions.map((a, i) => (
                        <option key={i} value={i}>{a.label}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}

              <div className="mt-4 space-y-4">
                <Field label="Address line 1" required>
                  <input type="text" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} required placeholder="House number and street" className="form-input" />
                </Field>
                <Field label="Address line 2">
                  <input type="text" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} placeholder="Optional" className="form-input" />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Town or city" required>
                    <input type="text" value={town} onChange={(e) => setTown(e.target.value)} required placeholder="Town" className="form-input" />
                  </Field>
                  <Field label="County">
                    <input type="text" value={county} onChange={(e) => setCounty(e.target.value)} placeholder="Optional" className="form-input" />
                  </Field>
                </div>
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-xl bg-cloud-light border border-border p-4 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[color:var(--color-blue,#1C54F2)]"
              />
              <span className="text-sm text-navy">
                I consent to my insurance details being shared with the clinic and stored on my patient record
                for the purpose of processing my treatment and billing.
              </span>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full justify-center"
              style={{ padding: "12px 0" }}
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : "Submit details"}
            </button>

            <p className="text-xs text-muted flex items-center justify-center gap-1.5">
              <Lock size={12} /> Sent securely. We never ask for a photo of your card.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-muted uppercase tracking-widest mb-2">
        {label}{required && <span className="text-blue"> *</span>}
      </span>
      {children}
    </label>
  );
}

function StatusCard({ icon, title, body, accent }: { icon: React.ReactNode; title: string; body: string; accent?: string }) {
  return (
    <div className="rounded-2xl bg-white surface-lit border border-border p-8 text-center shadow-sm">
      <div
        className={`h-14 w-14 rounded-xl flex items-center justify-center mx-auto mb-4 ${accent ? "" : "bg-cloud-light"}`}
        style={
          accent
            ? { background: `${accent}14`, boxShadow: `inset 0 0 0 1px ${accent}26` }
            : undefined
        }
      >
        {icon}
      </div>
      <h2 className="font-display text-[22px] text-navy mb-2">{title}</h2>
      <p className="text-sm text-muted">{body}</p>
    </div>
  );
}
