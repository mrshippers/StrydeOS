import { useCallback, useEffect, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "@/lib/firebase";

export interface AvaConfig {
  enabled: boolean;
  phone: string;
  ia_price: string;
  fu_price: string;
  address: string;
  nearest_station: string;
  parking_info: string;
}

export interface AvaRules {
  new_patient_booking: boolean;
  cancellation_recovery: boolean;
  noshow_followup: boolean;
  emergency_routing: boolean; // locked
  faq_handling: boolean;
}

export interface AvaSettings {
  config: AvaConfig;
  rules: AvaRules;
  hours: {
    start: string;
    end: string;
    days: string[];
    after_hours_mode: "voicemail" | "full_service" | "fallback";
    fallback_number: string | null;
  };
}

const DEFAULT_CONFIG: AvaConfig = {
  enabled: false,
  phone: "020 7794 0202",
  ia_price: "85",
  fu_price: "65",
  address: "",
  nearest_station: "",
  parking_info: "",
};

const DEFAULT_RULES: AvaRules = {
  new_patient_booking: true,
  cancellation_recovery: true,
  noshow_followup: true,
  emergency_routing: true,
  faq_handling: true,
};

const DEFAULT_HOURS: {
  start: string;
  end: string;
  days: string[];
  after_hours_mode: "voicemail" | "full_service" | "fallback";
  fallback_number: string | null;
} = {
  start: "09:00",
  end: "18:00",
  days: ["mon", "tue", "wed", "thu", "fri"],
  after_hours_mode: "voicemail",
  fallback_number: null,
};

export function useAvaConfig(clinicId: string | undefined) {
  const [config, setConfig] = useState<AvaConfig>(DEFAULT_CONFIG);
  const [rules, setRules] = useState<AvaRules>(DEFAULT_RULES);
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load settings from Firestore
  const load = useCallback(async () => {
    if (!db || !clinicId) {
      setLoading(false);
      return;
    }

    try {
      const clinicDoc = await getDoc(doc(db, "clinics", clinicId));
      if (!clinicDoc.exists()) {
        setLoading(false);
        return;
      }

      const data = clinicDoc.data();
      const avaData = data.ava || {};

      setConfig({
        enabled: avaData.enabled ?? DEFAULT_CONFIG.enabled,
        phone: avaData.config?.phone || DEFAULT_CONFIG.phone,
        ia_price: avaData.config?.ia_price || DEFAULT_CONFIG.ia_price,
        fu_price: avaData.config?.fu_price || DEFAULT_CONFIG.fu_price,
        address: avaData.config?.address || DEFAULT_CONFIG.address,
        nearest_station: avaData.config?.nearest_station || DEFAULT_CONFIG.nearest_station,
        parking_info: avaData.config?.parking_info || DEFAULT_CONFIG.parking_info,
      });

      setRules({
        new_patient_booking: avaData.rules?.new_patient_booking ?? true,
        cancellation_recovery: avaData.rules?.cancellation_recovery ?? true,
        noshow_followup: avaData.rules?.noshow_followup ?? true,
        emergency_routing: avaData.rules?.emergency_routing ?? true,
        faq_handling: avaData.rules?.faq_handling ?? true,
      });

      setHours({
        start: avaData.hours?.start ?? DEFAULT_HOURS.start,
        end: avaData.hours?.end ?? DEFAULT_HOURS.end,
        days: avaData.hours?.days ?? DEFAULT_HOURS.days,
        after_hours_mode: avaData.hours?.after_hours_mode ?? DEFAULT_HOURS.after_hours_mode,
        fallback_number: avaData.hours?.fallback_number ?? null,
      });
    } catch (err) {
      console.error("[Ava config load error]", err);
      setError("Failed to load Ava configuration");
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  useEffect(() => {
    load();
  }, [load]);

  // Generic save handler for any field
  const save = useCallback(
    async (updates: Partial<AvaSettings>) => {
      if (!db || !clinicId) return;
      setSaving(true);
      setError(null);

      try {
        const now = new Date().toISOString();
        const docUpdates: Record<string, unknown> = {
          updatedAt: now,
        };

        if (updates.config) {
          Object.entries(updates.config).forEach(([key, value]) => {
            docUpdates[`ava.config.${key}`] = value;
          });
          setConfig((prev) => ({ ...prev, ...updates.config }));
        }

        if (updates.rules) {
          Object.entries(updates.rules).forEach(([key, value]) => {
            docUpdates[`ava.rules.${key}`] = value;
          });
          setRules((prev) => ({ ...prev, ...updates.rules }));
        }

        if (updates.hours) {
          Object.entries(updates.hours).forEach(([key, value]) => {
            docUpdates[`ava.hours.${key}`] = value;
          });
          setHours((prev) => ({ ...prev, ...updates.hours }));
        }

        await updateDoc(doc(db, "clinics", clinicId), docUpdates);
      } catch (err) {
        console.error("[Ava config save error]", err);
        setError("Failed to save Ava configuration");
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [clinicId]
  );

  // Create or update ElevenLabs agent via API route
  const createOrUpdateAgent = useCallback(async () => {
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) {
        throw new Error("User not authenticated");
      }

      const token = await user.getIdToken();
      const response = await fetch("/api/ava/agent", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create/update agent");
      }

      const data = await response.json();
      return data.agent_id;
    } catch (err) {
      console.error("[Agent creation error]", err);
      throw err;
    }
  }, []);

  // Toggle Ava on/off
  const toggleEnabled = useCallback(async () => {
    await save({ config: { ...config, enabled: !config.enabled } });
  }, [config, save]);

  // Toggle individual rule
  const toggleRule = useCallback(
    async (rule: keyof AvaRules) => {
      const newRules = { ...rules, [rule]: !rules[rule] };
      await save({ rules: newRules });
    },
    [rules, save]
  );

  // Update config field with debounce
  const updateConfigField = useCallback(
    (field: keyof AvaConfig, value: string) => {
      const newConfig = { ...config, [field]: value };
      setConfig(newConfig);
      // Debounced save happens at component level
      return newConfig;
    },
    [config]
  );

  return {
    config,
    rules,
    hours,
    loading,
    saving,
    error,
    toggleEnabled,
    toggleRule,
    updateConfigField,
    save,
    reload: load,
    createOrUpdateAgent,
  };
}
