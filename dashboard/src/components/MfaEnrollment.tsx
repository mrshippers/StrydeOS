"use client";

import { useState } from "react";
import { motion } from "motion/react";
import {
  multiFactor,
  TotpMultiFactorGenerator,
  TotpSecret,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { Loader2, Shield, Check, X, Copy } from "lucide-react";
import QRCode from "qrcode";

interface MfaEnrollmentProps {
  onComplete: () => void;
  onSkip?: () => void;
}

export function MfaEnrollment({ onComplete, onSkip }: MfaEnrollmentProps) {
  const [step, setStep] = useState<"setup" | "verify">("setup");
  const [totpSecret, setTotpSecret] = useState<TotpSecret | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [verificationCode, setVerificationCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSetup() {
    setLoading(true);
    setError(null);

    try {
      const auth = getFirebaseAuth();
      if (!auth?.currentUser) {
        setError("Not authenticated");
        return;
      }

      const session = await multiFactor(auth.currentUser).getSession();
      const secret = await TotpMultiFactorGenerator.generateSecret(session);

      setTotpSecret(secret);

      const otpauthUrl = secret.generateQrCodeUrl(
        auth.currentUser.email || "user@strydeos.com",
        "StrydeOS"
      );

      const qrUrl = await QRCode.toDataURL(otpauthUrl);
      setQrCodeUrl(qrUrl);
      setStep("verify");
    } catch (err: unknown) {
      console.error("[MFA setup error]", err);
      const code = (err as { code?: string })?.code ?? "";
      if (code === "auth/operation-not-allowed" || code === "auth/unsupported-first-factor") {
        setError("MFA requires Firebase Identity Platform to be enabled. Contact your administrator.");
      } else if (code === "auth/unverified-email") {
        setError("Please verify your email address before enabling MFA.");
      } else {
        setError("Failed to setup MFA. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (!totpSecret || !verificationCode) return;

    setLoading(true);
    setError(null);

    try {
      const auth = getFirebaseAuth();
      if (!auth?.currentUser) {
        setError("Not authenticated");
        return;
      }

      const multiFactorAssertion = TotpMultiFactorGenerator.assertionForEnrollment(
        totpSecret,
        verificationCode
      );

      await multiFactor(auth.currentUser).enroll(
        multiFactorAssertion,
        "Authenticator App"
      );

      onComplete();
    } catch (err) {
      console.error("[MFA verify error]", err);
      setError("Invalid code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function copySecretKey() {
    if (totpSecret) {
      navigator.clipboard.writeText(totpSecret.secretKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (step === "setup") {
    return (
      <div className="max-w-md mx-auto">
        <div className="flex items-start gap-4 mb-6">
          <div className="h-12 w-12 rounded-xl bg-blue/10 flex items-center justify-center shrink-0">
            <Shield size={24} className="text-blue" />
          </div>
          <div>
            <h2 className="font-display text-[24px] text-navy leading-tight mb-2">
              Enable Two-Factor Authentication
            </h2>
            <p className="text-sm text-muted">
              Add an extra layer of security to your account using an authenticator app
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-blue/5 border border-blue/20 mb-6">
          <p className="text-[13px] text-navy leading-relaxed">
            Two-factor authentication (2FA) requires you to enter a time-based code from your
            authenticator app (like Google Authenticator or Authy) when signing in, making your
            account significantly more secure.
          </p>
        </div>

        <button
          onClick={handleSetup}
          disabled={loading}
          className="btn-primary w-full justify-center mb-4"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <>Get Started</>}
        </button>

        {onSkip && (
          <button
            onClick={onSkip}
            className="w-full py-3 rounded-xl text-sm font-semibold text-navy border border-border hover:bg-cloud-light transition-colors"
          >
            Skip for Now
          </button>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-danger/10 border border-danger/20 text-[13px] text-danger">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-start gap-4 mb-6">
        <div className="h-12 w-12 rounded-xl bg-blue/10 flex items-center justify-center shrink-0">
          <Shield size={24} className="text-blue" />
        </div>
        <div>
          <h2 className="font-display text-[24px] text-navy leading-tight mb-2">
            Scan QR Code
          </h2>
          <p className="text-sm text-muted">
            Use your authenticator app to scan this code
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {qrCodeUrl && (
          <div className="flex justify-center">
            <div className="p-4 rounded-2xl bg-white dark:!bg-white border-2 border-border">
              <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48" />
            </div>
          </div>
        )}

        <div className="p-4 rounded-xl bg-cloud-light border border-border">
          <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-2">
            Or enter this key manually
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm text-navy font-mono bg-white px-3 py-2 rounded-lg border border-border">
              {totpSecret?.secretKey}
            </code>
            <button
              onClick={copySecretKey}
              className="p-2 rounded-lg border border-border hover:bg-white transition-colors"
            >
              {copied ? <Check size={16} className="text-success" /> : <Copy size={16} className="text-muted" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-widest mb-2">
            Verification Code
          </label>
          <input
            type="text"
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
            maxLength={6}
            placeholder="000000"
            className="w-full px-4 py-3 rounded-xl text-sm text-navy text-center font-mono placeholder-muted border border-border bg-white focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all"
          />
        </div>

        <button
          onClick={handleVerify}
          disabled={loading || verificationCode.length !== 6}
          className="btn-primary w-full justify-center"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <>Verify & Enable</>}
        </button>

        {error && (
          <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-[13px] text-danger">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
