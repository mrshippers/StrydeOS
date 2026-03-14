"use client";

import { useState, type FC } from "react";
import { type ReactNode } from "react";
import { Mail, MessageSquare, Clock, Send, Eye, MousePointer, CalendarCheck, ChevronDown, ChevronRight, PoundSterling } from "lucide-react";
import type { SequenceDefinition } from "@/types/comms";

interface SequenceStats {
  sent: number;
  opened: number;
  clicked: number;
  rebooked: number;
  attributedRevenuePence: number;
}

interface Props {
  definition: SequenceDefinition;
  stats: SequenceStats;
  showRevenue: boolean;
  onToggle: (active: boolean) => void;
}

const CHANNEL_ICONS: Record<string, ReactNode> = {
  sms:      <MessageSquare size={14} />,
  email:    <Mail size={14} />,
  whatsapp: <MessageSquare size={14} />,
};

export const SequenceCard: FC<Props> = ({ definition, stats, showRevenue, onToggle }) => {
  const [expanded, setExpanded] = useState(false);

  const conversionRate = stats.sent > 0
    ? Math.round((stats.rebooked / stats.sent) * 100)
    : 0;

  return (
    <div className="rounded-[12px] bg-white border border-gray-200 shadow-sm overflow-hidden transition-shadow hover:shadow-md">
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0891B2]/10 flex items-center justify-center shrink-0">
              {definition.steps[0]?.channel === "sms"
                ? <MessageSquare size={16} className="text-[#0891B2]" />
                : <Mail size={16} className="text-[#0891B2]" />}
            </div>
            <div>
              <h4 className="text-sm font-semibold text-[#0B2545]">{definition.name}</h4>
              <p className="text-xs text-gray-400 mt-0.5">
                {definition.steps.length} step{definition.steps.length !== 1 ? "s" : ""} ·{" "}
                {definition.attributionWindowDays
                  ? `${definition.attributionWindowDays}d attribution window`
                  : "no attribution"}
              </p>
              <button
                onClick={() => setExpanded((e) => !e)}
                className="text-[11px] font-semibold text-[#0891B2] hover:text-[#0670A0] transition-colors mt-1 flex items-center gap-1"
              >
                {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                View cadence
              </button>
            </div>
          </div>
          <button
            onClick={() => onToggle(!definition.active)}
            className="shrink-0 ml-2"
            title={definition.active ? "Disable sequence" : "Enable sequence"}
          >
            <div className={`w-10 h-5 rounded-full transition-colors relative ${definition.active ? "bg-[#0891B2]" : "bg-gray-200"}`}>
              <div
                className="w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all"
                style={{ left: definition.active ? "1.375rem" : "0.125rem" }}
              />
            </div>
          </button>
        </div>

        {stats.sent > 0 && (
          <div className={`grid gap-3 pt-3 border-t border-gray-100 ${showRevenue ? "grid-cols-5" : "grid-cols-4"}`}>
            <div className="text-center">
              <p className="font-semibold text-lg text-[#0B2545]">{stats.sent}</p>
              <p className="text-[10px] text-gray-400 flex items-center justify-center gap-1"><Send size={9} /> Sent</p>
            </div>
            <div className="text-center">
              <p className="font-semibold text-lg text-[#0B2545]">{stats.opened}</p>
              <p className="text-[10px] text-gray-400 flex items-center justify-center gap-1"><Eye size={9} /> Opened</p>
            </div>
            <div className="text-center">
              <p className="font-semibold text-lg text-[#0B2545]">{stats.clicked}</p>
              <p className="text-[10px] text-gray-400 flex items-center justify-center gap-1"><MousePointer size={9} /> Clicked</p>
            </div>
            <div className="text-center">
              <p className="font-semibold text-lg text-[#0B2545]">{conversionRate}%</p>
              <p className="text-[10px] text-gray-400 flex items-center justify-center gap-1"><CalendarCheck size={9} /> Rebooked</p>
            </div>
            {showRevenue && (
              <div className="text-center">
                <p className="font-semibold text-lg text-[#0891B2]">
                  £{(stats.attributedRevenuePence / 100).toFixed(0)}
                </p>
                <p className="text-[10px] text-gray-400 flex items-center justify-center gap-1"><PoundSterling size={9} /> Recovered</p>
              </div>
            )}
          </div>
        )}
      </div>

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-3 space-y-2">
          {definition.steps.map((step) => (
            <div key={step.stepNumber} className="flex items-center gap-3">
              <span className="w-5 h-5 rounded-full bg-[#0891B2]/10 text-[#0891B2] text-[10px] font-bold flex items-center justify-center shrink-0">
                {step.stepNumber}
              </span>
              <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">
                {CHANNEL_ICONS[step.channel] ?? <Mail size={14} />}
                {step.channel.toUpperCase()}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-gray-400 shrink-0">
                <Clock size={9} />
                Day {step.daysAfterTrigger}
              </span>
              <span className="text-[10px] text-gray-400 font-mono truncate">{step.templateKey}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
