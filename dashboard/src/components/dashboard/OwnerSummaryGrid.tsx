"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";

import RevenueTile from "@/components/owner-summary/RevenueTile";
import TodayTile from "@/components/owner-summary/TodayTile";
import RetentionTile from "@/components/owner-summary/RetentionTile";
import UtilisationTile from "@/components/owner-summary/UtilisationTile";
import { SortableTile } from "@/components/dashboard/SortableTile";
import { useDashboardLayout } from "@/hooks/useDashboardLayout";
import type {
  RetentionAlert,
  ClinicianUtilisationRow,
} from "@/hooks/useOwnerSummary";

/**
 * The canonical four-tile Owner Summary grid — now drag-reorderable, with the
 * order persisted per user (Firestore users/{uid}.dashboardLayout, localStorage
 * fallback). Each tile keeps its own deep-link to the owning module; the corner
 * grip handle drives reordering. Order is the only thing personalised here — the
 * metrics, links and module tints are unchanged.
 */

const CARD_IDS = ["revenue", "today", "retention", "utilisation"] as const;

interface OwnerSummaryGridProps {
  revenueMtdPence: number;
  todayTotal: number;
  todayDnas: number;
  retentionAlerts: RetentionAlert[];
  retentionAlertCount: number;
  clinicianUtilisation: ClinicianUtilisationRow[];
  loading: boolean;
  revenueLabel: string;
  appointmentLabel: string;
}

export default function OwnerSummaryGrid({
  revenueMtdPence,
  todayTotal,
  todayDnas,
  retentionAlerts,
  retentionAlertCount,
  clinicianUtilisation,
  loading,
  revenueLabel,
  appointmentLabel,
}: OwnerSummaryGridProps) {
  const { order, setOrder } = useDashboardLayout(CARD_IDS);

  const sensors = useSensors(
    // 6px activation distance keeps a plain click on the tile a navigation,
    // not an accidental drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const cards = useMemo(
    () => ({
      revenue: {
        label: "Revenue",
        node: (
          <Link
            href="/intelligence"
            aria-label="Open Intelligence"
            className="group block rounded-[24px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple/40"
          >
            <RevenueTile
              revenueMtdPence={revenueMtdPence}
              periodLabel={revenueLabel}
              loading={loading}
            />
          </Link>
        ),
      },
      today: {
        label: "Schedule",
        node: (
          <Link
            href="/continuity"
            aria-label="Open Pulse"
            className="group block rounded-[24px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
          >
            <TodayTile
              todayTotal={todayTotal}
              todayDnas={todayDnas}
              periodLabel={appointmentLabel}
              loading={loading}
            />
          </Link>
        ),
      },
      retention: {
        label: "Retention",
        node: (
          <Link
            href="/continuity"
            aria-label="Open Pulse retention"
            className="group block rounded-[24px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
          >
            <RetentionTile
              alerts={retentionAlerts}
              alertCount={retentionAlertCount}
              loading={loading}
            />
          </Link>
        ),
      },
      utilisation: {
        label: "Utilisation",
        node: (
          <Link
            href="/receptionist"
            aria-label="Open Ava"
            className="group block rounded-[24px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/40"
          >
            <UtilisationTile rows={clinicianUtilisation} loading={loading} />
          </Link>
        ),
      },
    }),
    [
      revenueMtdPence,
      revenueLabel,
      loading,
      todayTotal,
      todayDnas,
      appointmentLabel,
      retentionAlerts,
      retentionAlertCount,
      clinicianUtilisation,
    ]
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    setOrder(arrayMove(order, oldIndex, newIndex));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={order} strategy={rectSortingStrategy}>
        <ul
          role="list"
          aria-label="Owner summary tiles, drag to reorder"
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 m-0 p-0"
        >
          {order.map((id) => {
            const card = cards[id as (typeof CARD_IDS)[number]];
            if (!card) return null;
            return (
              <SortableTile key={id} id={id} label={card.label}>
                {card.node}
              </SortableTile>
            );
          })}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
