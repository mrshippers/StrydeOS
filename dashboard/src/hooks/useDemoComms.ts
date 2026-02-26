import type { CommsLogEntry, SequenceType, CommsChannel } from "@/types";
import type { CommsSequenceConfig, CommsStats } from "@/types/comms";
import { DEFAULT_SEQUENCES } from "@/types/comms";

export interface CommsSequenceWithStats extends CommsSequenceConfig {
  sent: number;
  opened: number;
  clicked: number;
  rebooked: number;
}

function makeDemoLog(
  id: string,
  patientId: string,
  seq: SequenceType,
  channel: CommsChannel,
  sentAt: string,
  opened: boolean,
  clicked: boolean,
  rebooked: boolean,
): CommsLogEntry {
  return {
    id,
    patientId,
    sequenceType: seq,
    channel,
    sentAt,
    openedAt: opened ? new Date(new Date(sentAt).getTime() + 3600000).toISOString() : undefined,
    clickedAt: clicked ? new Date(new Date(sentAt).getTime() + 7200000).toISOString() : undefined,
    outcome: rebooked ? "booked" : "no_action",
  };
}

export function getDemoCommsSequences(): CommsSequenceWithStats[] {
  return DEFAULT_SEQUENCES.map((seq) => {
    switch (seq.type) {
      case "hep_reminder":
        return { ...seq, sent: 42, opened: 35, clicked: 28, rebooked: 0 };
      case "rebooking_prompt":
        return { ...seq, sent: 18, opened: 14, clicked: 9, rebooked: 7 };
      case "pre_auth_collection":
        return { ...seq, sent: 8, opened: 7, clicked: 5, rebooked: 0 };
      case "review_prompt":
        return { ...seq, sent: 12, opened: 10, clicked: 8, rebooked: 0 };
      case "reactivation_90d":
        return { ...seq, sent: 6, opened: 4, clicked: 2, rebooked: 1 };
      case "reactivation_180d":
        return { ...seq, sent: 0, opened: 0, clicked: 0, rebooked: 0 };
      default:
        return { ...seq, sent: 0, opened: 0, clicked: 0, rebooked: 0 };
    }
  });
}

export function getDemoCommsLog(): CommsLogEntry[] {
  return [
    makeDemoLog("cl1", "p1", "hep_reminder", "email", "2026-02-19T10:00:00Z", true, true, false),
    makeDemoLog("cl2", "p2", "hep_reminder", "email", "2026-02-15T10:00:00Z", true, false, false),
    makeDemoLog("cl3", "p3", "rebooking_prompt", "sms", "2026-02-04T14:00:00Z", true, true, true),
    makeDemoLog("cl4", "p5", "rebooking_prompt", "sms", "2026-01-31T14:00:00Z", true, true, false),
    makeDemoLog("cl5", "p9", "rebooking_prompt", "sms", "2026-02-02T14:00:00Z", true, false, false),
    makeDemoLog("cl6", "p3", "pre_auth_collection", "email", "2026-02-01T09:00:00Z", true, true, false),
    makeDemoLog("cl7", "p8", "pre_auth_collection", "email", "2026-02-12T09:00:00Z", true, true, false),
    makeDemoLog("cl8", "p7", "review_prompt", "sms", "2026-02-12T18:00:00Z", true, true, false),
    makeDemoLog("cl9", "p12", "review_prompt", "sms", "2026-02-07T18:00:00Z", true, true, false),
    makeDemoLog("cl10", "p7", "reactivation_90d", "email", "2026-02-17T08:00:00Z", false, false, false),
  ];
}

export function getDemoCommsStats(): CommsStats {
  const sequences = getDemoCommsSequences();
  const totalSent = sequences.reduce((s, seq) => s + seq.sent, 0);
  const totalOpened = sequences.reduce((s, seq) => s + seq.opened, 0);
  const totalClicked = sequences.reduce((s, seq) => s + seq.clicked, 0);
  const totalRebooked = sequences.reduce((s, seq) => s + seq.rebooked, 0);
  return {
    totalSent,
    openRate: totalSent > 0 ? totalOpened / totalSent : 0,
    clickRate: totalSent > 0 ? totalClicked / totalSent : 0,
    conversionToRebook: totalSent > 0 ? totalRebooked / totalSent : 0,
  };
}
