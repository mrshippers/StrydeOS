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
import { ShieldCheck, Loader2, CheckCircle2, AlertCircle, Lock, MapPin, Search } from "lucide-react";

interface IntakeMeta {
  clinicName: string;
  insurerOptions: string[];
  status: "issued" | "submitted";
  consentVersion: string;
}

type Phase = "loading" | "form" | "submitted" | "done" | "error";

export default function InsuranceIntakePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [phase, setPhase] = useState<Phase>("loading");
  const [meta, setMeta] = useState<IntakeMeta | null>(null);
  const [loadError, setLoadError] = useState<string>("");

  const [insurerName, setInsurerName] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [scheme, setScheme] = useState("");
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

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function lookupPostcode() {
    const pc = postcode.trim();
    if (!pc) {
      setLookupMsg("Enter a postcode first.");
      return;
    }
    setLookingUp(true);
    setLookupMsg("");
    try {
      const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
      if (!res.ok) {
        setLookupMsg("Postcode not found — please check it.");
        return;
      }
      const data = await res.json();
      const r = data.result ?? {};
      setTown(r.admin_district || r.parish || town);
      setCounty(r.admin_county || r.region || county);
      setCountry(r.country || "United Kingdom");
      setPostcode((r.postcode || pc).toUpperCase());
      setLookupMsg("Area filled from your postcode — add your street below.");
    } catch {
      setLookupMsg("Could not look up that postcode.");
    } finally {
      setLookingUp(false);
    }
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
          policyNumber,
          scheme: scheme || undefined,
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

  return (
    <div className="min-h-screen bg-cloud-dancer flex flex-col items-center px-5 py-10">
      <div className="w-full max-w-lg animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-11 h-11 rounded-xl bg-blue/10 flex items-center justify-center">
            <ShieldCheck size={22} className="text-blue" />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-widest">Insurance details</p>
            <h1 className="font-display text-[26px] text-navy leading-tight">
              {meta?.clinicName ?? "Your clinic"}
            </h1>
          </div>
        </div>

        {phase === "loading" && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-muted" />
          </div>
        )}

        {phase === "error" && (
          <StatusCard icon={<AlertCircle size={28} className="text-danger" />} title="Link unavailable" body={loadError} />
        )}

        {phase === "submitted" && (
          <StatusCard
            icon={<CheckCircle2 size={28} className="text-success" />}
            title="Already received"
            body="Your insurance details have already been submitted. There is nothing more to do."
          />
        )}

        {phase === "done" && (
          <StatusCard
            icon={<CheckCircle2 size={28} className="text-success" />}
            title="Thank you"
            body="Your insurance details have been sent to the clinic. They will be added to your file ahead of your appointment."
          />
        )}

        {phase === "form" && (
          <form onSubmit={handleSubmit} className="rounded-2xl bg-white border border-border p-6 shadow-sm space-y-5">
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
              {hasOptions ? (
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

            <Field label="Scheme or plan">
              <input type="text" value={scheme} onChange={(e) => setScheme(e.target.value)} placeholder="Optional" className="form-input" />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Authorisation code">
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

              <Field label="Postcode" required>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value)}
                    required
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
                    Find
                  </button>
                </div>
              </Field>
              {lookupMsg && <p className="text-xs text-muted mt-1.5">{lookupMsg}</p>}

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

function StatusCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl bg-white border border-border p-8 text-center shadow-sm">
      <div className="h-14 w-14 rounded-xl bg-cloud-light flex items-center justify-center mx-auto mb-4">{icon}</div>
      <h2 className="font-display text-[22px] text-navy mb-2">{title}</h2>
      <p className="text-sm text-muted">{body}</p>
    </div>
  );
}
