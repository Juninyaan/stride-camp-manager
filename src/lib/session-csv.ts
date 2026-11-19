import { parseCsv } from "./csv.ts";

export type SessionImportRow = {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
};

export const sessionImportColumns = ["title", "date", "start_time", "end_time"] as const;

export function parseSessionCsv(text: string, camp: { startDate: string; endDate: string }): SessionImportRow[] {
  return parseCsv(text, sessionImportColumns).map(([title, date, startTime, endTime], index) => {
    const prefix = `Row ${index + 2}:`;
    if (!title || title.length > 120) throw new Error(`${prefix} title is required and must be at most 120 characters.`);
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
      throw new Error(`${prefix} date must be a valid YYYY-MM-DD date.`);
    }
    if (date < camp.startDate || date > camp.endDate) throw new Error(`${prefix} date must be within the selected camp.`);
    if (![startTime, endTime].every((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
      throw new Error(`${prefix} times must use 24-hour HH:MM format.`);
    }
    if (endTime <= startTime) throw new Error(`${prefix} end time must be after start time.`);
    return { title, date, startTime, endTime };
  });
}

export function uniqueSessionRows(rows: SessionImportRow[], existing: { date: string; startTime: string }[]) {
  const seen = new Set(existing.map((session) => `${session.date}|${session.startTime}`));
  const unique = rows.filter((row) => {
    const key = `${row.date}|${row.startTime}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { rows: unique, skipped: rows.length - unique.length };
}
