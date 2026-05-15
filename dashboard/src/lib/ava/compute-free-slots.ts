export interface HoursConfig {
  start?: string;
  end?: string;
  days?: string[];
}

const DAY_MAP: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

/**
 * Compute free 45-minute appointment slots from a list of booked appointments.
 *
 * @param appointments  List of booked appointments with dateTime strings.
 * @param dateFrom      Start of the search window.
 * @param dateTo        End of the search window.
 * @param hoursConfig   Optional clinic hours. Defaults to Mon–Fri 09:00–18:00.
 * @returns             Up to 6 free slot start times.
 */
export function computeFreeSlots(
  appointments: { dateTime: string }[],
  dateFrom: Date,
  dateTo: Date,
  hoursConfig?: HoursConfig,
): Date[] {
  const SLOT_MINS = 45;
  const SLOT_MS = SLOT_MINS * 60_000;

  const [startH = 9, startM = 0] = (hoursConfig?.start ?? "09:00").split(":").map(Number);
  const [endH = 18, endM = 0] = (hoursConfig?.end ?? "18:00").split(":").map(Number);
  const clinicStartMins = startH * 60 + startM;
  const clinicEndMins = endH * 60 + endM;

  const allowedDays: Set<number> = hoursConfig?.days
    ? new Set(hoursConfig.days.map((d) => DAY_MAP[d.toLowerCase().slice(0, 3)] ?? -1))
    : new Set([1, 2, 3, 4, 5]);

  const busyIntervals = appointments.map((a) => {
    const start = new Date(a.dateTime).getTime();
    return { start, end: start + SLOT_MS };
  });

  const cursor = new Date(dateFrom);
  cursor.setSeconds(0, 0);
  const totalMins = cursor.getHours() * 60 + cursor.getMinutes();
  const snappedMins = Math.ceil(totalMins / SLOT_MINS) * SLOT_MINS;
  cursor.setHours(Math.floor(snappedMins / 60), snappedMins % 60, 0, 0);

  const freeSlots: Date[] = [];

  while (cursor < dateTo && freeSlots.length < 6) {
    const day = cursor.getDay();
    const cursorMins = cursor.getHours() * 60 + cursor.getMinutes();

    if (!allowedDays.has(day) || cursorMins >= clinicEndMins) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(Math.floor(clinicStartMins / 60), clinicStartMins % 60, 0, 0);
      continue;
    }

    if (cursorMins < clinicStartMins) {
      cursor.setHours(Math.floor(clinicStartMins / 60), clinicStartMins % 60, 0, 0);
      continue;
    }

    const slotStart = cursor.getTime();
    const slotEnd = slotStart + SLOT_MS;
    const isBusy = busyIntervals.some(({ start, end }) => slotStart < end && start < slotEnd);
    if (!isBusy) freeSlots.push(new Date(cursor));

    cursor.setMinutes(cursor.getMinutes() + SLOT_MINS);
  }

  return freeSlots;
}
