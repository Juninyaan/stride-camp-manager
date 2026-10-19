import type { SupabaseClient } from "@supabase/supabase-js";

export type AttendanceStatus = "present" | "absent" | "excused";
export type RegistrationStatus = "pending" | "registered" | "waitlisted" | "expired" | "withdrawn";
export type PaymentStatus = "unpaid" | "paid" | "expired";
export type CampColor = "mint" | "peach" | "lavender";

export type Camp = {
  id: string;
  name: string;
  location: string;
  startDate: string;
  endDate: string;
  ageGroup: string;
  capacity: number;
  price: number;
};
export type Participant = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  guardianName: string;
  guardianEmail: string;
  dateOfBirth: string;
  bloodType: string;
  allergies: string;
  conditions: string;
  medications: string;
  emergencyName: string;
  emergencyPhone: string;
  medicalNotes: string;
};
export type Registration = {
  id: string;
  campId: string;
  participantId: string;
  status: RegistrationStatus;
  paymentStatus: PaymentStatus;
  amount: number;
  paidOn: string;
  expiresOn: string;
  paymentMethod: string;
  paymentReference: string;
};
export type CampSession = { id: string; campId: string; title: string; date: string; startTime: string; endTime: string };
export type AttendanceRecord = { sessionId: string; participantId: string; status: AttendanceStatus };
export type VitalRecord = {
  id: string;
  participantId: string;
  recordedOn: string;
  heightCm: number | null;
  weightKg: number | null;
  restingHeartRate: number | null;
  systolic: number | null;
  diastolic: number | null;
  notes: string;
};
export type CampData = {
  camps: Camp[];
  participants: Participant[];
  registrations: Registration[];
  sessions: CampSession[];
  attendance: AttendanceRecord[];
  vitals: VitalRecord[];
};

export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || "MVR";
export const campColors: CampColor[] = ["mint", "peach", "lavender"];
export const avatarColors = ["avatar-rose", "avatar-blue", "avatar-gold", "avatar-violet"];
export const paymentMethods = ["Cash", "Card", "Bank transfer", "Other"];
export const bloodTypes = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const emptyHealth = {
  dateOfBirth: "", bloodType: "", allergies: "", conditions: "", medications: "",
  emergencyName: "", emergencyPhone: "", medicalNotes: "",
};

const pad = (value: number) => String(value).padStart(2, "0");

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(date: string, days: number) {
  const result = new Date(`${date}T12:00:00`);
  result.setDate(result.getDate() + days);
  return localDate(result);
}

export function startOfWeek(date: string) {
  const day = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
  return addDays(date, -day);
}

export function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatDateYear(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatLongDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export function formatTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return { time: `${pad(hours % 12 || 12)}:${pad(minutes)}`, period: hours >= 12 ? "PM" : "AM" };
}

export function formatMoney(value: number) {
  return `${CURRENCY} ${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function toIso(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

export function sortCamps(list: Camp[]) {
  return [...list].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function sortSessions(list: CampSession[]) {
  return [...list].sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
}

export function fullName(person: { firstName: string; lastName: string }) {
  return `${person.firstName} ${person.lastName}`;
}

export function initialsOf(person: { firstName: string; lastName: string }) {
  return `${person.firstName[0] ?? ""}${person.lastName[0] ?? ""}`.toUpperCase();
}

export function avatarFor(name: string) {
  const total = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return avatarColors[total % avatarColors.length];
}

export function ageFrom(dateOfBirth: string, today: string) {
  if (!dateOfBirth) return null;
  const birth = new Date(`${dateOfBirth}T12:00:00`);
  const now = new Date(`${today}T12:00:00`);
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

export function regularity(rate: number | null) {
  if (rate === null) return "No attendance recorded";
  if (rate >= 90) return "Very regular";
  if (rate >= 75) return "Regular";
  if (rate >= 50) return "Irregular";
  return "Rarely attends";
}

// A paid registration whose valid-until date has passed is treated as expired (removed from the roster).
export function withExpiry(registration: Registration, today: string): Registration {
  if (registration.status === "registered" && registration.expiresOn && registration.expiresOn < today) {
    return { ...registration, status: "expired", paymentStatus: "expired" };
  }
  return registration;
}

export function startingRegistration(camp: Camp, enrolled: number): Omit<Registration, "id" | "campId" | "participantId"> {
  const full = enrolled >= camp.capacity;
  const free = camp.price <= 0 && !full;
  return {
    status: full ? "waitlisted" : free ? "registered" : "pending",
    paymentStatus: free ? "paid" : "unpaid",
    amount: camp.price,
    paidOn: free ? localDate() : "",
    expiresOn: free ? camp.endDate : "",
    paymentMethod: "",
    paymentReference: "",
  };
}

export function toRegistrationRow(registration: Omit<Registration, "id">) {
  return {
    camp_id: registration.campId,
    participant_id: registration.participantId,
    status: registration.status,
    payment_status: registration.paymentStatus,
    amount: registration.amount,
    paid_at: registration.paidOn ? new Date(`${registration.paidOn}T12:00:00`).toISOString() : null,
    expires_on: registration.expiresOn || null,
    payment_method: registration.paymentMethod || null,
    payment_reference: registration.paymentReference || null,
  };
}

export async function createRegistration(
  client: SupabaseClient | null,
  camp: Camp,
  enrolled: number,
  participantId: string,
): Promise<{ registration: Registration | null; error: string }> {
  const draft = { campId: camp.id, participantId, ...startingRegistration(camp, enrolled) };
  if (!client) return { registration: { id: crypto.randomUUID(), ...draft }, error: "" };

  const { data, error } = await client.from("camp_registrations").insert(toRegistrationRow(draft)).select("id").single();
  if (error) return { registration: null, error: error.message };
  return { registration: { id: data.id, ...draft }, error: "" };
}

function describeLoadError(message: string) {
  return /column|schema cache|relation|does not exist/i.test(message)
    ? `${message}. Apply the latest SQL files in supabase/migrations to your Supabase project.`
    : message;
}

export async function loadCampData(client: SupabaseClient): Promise<CampData> {
  // Persist expiries; harmless if the migration has not been applied yet.
  await client.rpc("expire_overdue_registrations");

  const [campResult, participantResult, registrationResult, sessionResult, attendanceResult, vitalResult] = await Promise.all([
    client.from("camps").select("id, name, location, start_date, end_date, age_group, capacity, price").order("start_date", { ascending: true }),
    client.from("participants").select("id, first_name, last_name, email, guardian_name, guardian_email, date_of_birth, blood_type, allergies, medical_conditions, medications, emergency_contact_name, emergency_contact_phone, medical_notes").order("created_at", { ascending: false }),
    client.from("camp_registrations").select("id, camp_id, participant_id, status, payment_status, amount, paid_at, expires_on, payment_method, payment_reference"),
    client.from("sessions").select("id, camp_id, title, starts_at, ends_at").order("starts_at", { ascending: true }),
    client.from("attendance").select("session_id, participant_id, status"),
    client.from("participant_vitals").select("id, participant_id, recorded_on, height_cm, weight_kg, resting_heart_rate, systolic, diastolic, notes").order("recorded_on", { ascending: false }),
  ]);

  const failed = [campResult, participantResult, registrationResult, sessionResult, attendanceResult, vitalResult].find((result) => result.error);
  if (failed?.error) throw new Error(describeLoadError(failed.error.message));

  const optionalNumber = (value: unknown) => (value === null || value === undefined ? null : Number(value));

  return {
    camps: (campResult.data ?? []).map((row) => ({
      id: row.id, name: row.name, location: row.location, startDate: row.start_date, endDate: row.end_date,
      ageGroup: row.age_group, capacity: row.capacity, price: Number(row.price ?? 0),
    })),
    participants: (participantResult.data ?? []).map((row) => ({
      id: row.id, firstName: row.first_name, lastName: row.last_name, email: row.email ?? "",
      guardianName: row.guardian_name ?? "", guardianEmail: row.guardian_email ?? "",
      dateOfBirth: row.date_of_birth ?? "", bloodType: row.blood_type ?? "", allergies: row.allergies ?? "",
      conditions: row.medical_conditions ?? "", medications: row.medications ?? "",
      emergencyName: row.emergency_contact_name ?? "", emergencyPhone: row.emergency_contact_phone ?? "",
      medicalNotes: row.medical_notes ?? "",
    })),
    registrations: (registrationResult.data ?? []).map((row) => ({
      id: row.id, campId: row.camp_id, participantId: row.participant_id, status: row.status,
      paymentStatus: row.payment_status, amount: Number(row.amount ?? 0),
      paidOn: row.paid_at ? localDate(new Date(row.paid_at)) : "", expiresOn: row.expires_on ?? "",
      paymentMethod: row.payment_method ?? "", paymentReference: row.payment_reference ?? "",
    })),
    sessions: (sessionResult.data ?? []).map((row) => {
      const start = new Date(row.starts_at);
      const end = new Date(row.ends_at);
      return {
        id: row.id, campId: row.camp_id, title: row.title, date: localDate(start),
        startTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
        endTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
      };
    }),
    attendance: (attendanceResult.data ?? []).map((row) => ({
      sessionId: row.session_id, participantId: row.participant_id, status: row.status,
    })),
    vitals: (vitalResult.data ?? []).map((row) => ({
      id: row.id, participantId: row.participant_id, recordedOn: row.recorded_on,
      heightCm: optionalNumber(row.height_cm), weightKg: optionalNumber(row.weight_kg),
      restingHeartRate: optionalNumber(row.resting_heart_rate), systolic: optionalNumber(row.systolic),
      diastolic: optionalNumber(row.diastolic), notes: row.notes ?? "",
    })),
  };
}

// Demo-mode sample data, used only when Supabase is not configured.
export function seedData(): CampData {
  const camps: Camp[] = [
    { id: "demo-camp-1", name: "Junior Strikers", location: "Stride Performance Center", startDate: "2026-10-19", endDate: "2026-10-23", ageGroup: "Ages 8–12", capacity: 30, price: 450 },
    { id: "demo-camp-2", name: "Speed & Agility Lab", location: "Northside Athletics Field", startDate: "2026-10-26", endDate: "2026-10-30", ageGroup: "Ages 13–17", capacity: 20, price: 600 },
    { id: "demo-camp-3", name: "All-Star Skills Week", location: "Stride Performance Center", startDate: "2026-11-02", endDate: "2026-11-06", ageGroup: "Ages 10–14", capacity: 32, price: 750 },
    { id: "demo-camp-4", name: "Foundations Kickoff", location: "Eastside Community Field", startDate: "2026-10-05", endDate: "2026-10-09", ageGroup: "Ages 9–13", capacity: 28, price: 400 },
  ];
  const blank = { email: "", guardianName: "", guardianEmail: "", dateOfBirth: "", bloodType: "", allergies: "", conditions: "", medications: "", emergencyName: "", emergencyPhone: "", medicalNotes: "" };
  const participants: Participant[] = [
    { ...blank, id: "demo-p-1", firstName: "Olivia", lastName: "Rhye", dateOfBirth: "2014-03-12", bloodType: "O+", allergies: "Peanuts", conditions: "Mild asthma", medications: "Inhaler as needed", emergencyName: "Sara Rhye", emergencyPhone: "555-0100", guardianName: "Sara Rhye" },
    ...[["Phoenix", "Baker"], ["Lana", "Steiner"], ["Demi", "Wilkinson"], ["Candice", "Wu"], ["Natali", "Craig"], ["Drew", "Cano"], ["Orlando", "Diggs"]]
      .map(([firstName, lastName], index) => ({ ...blank, id: `demo-p-${index + 2}`, firstName, lastName })),
  ];
  const plan: [string, string, "paid" | "pending"][] = [
    ["demo-p-1", "demo-camp-1", "paid"], ["demo-p-1", "demo-camp-4", "paid"],
    ["demo-p-2", "demo-camp-2", "paid"], ["demo-p-2", "demo-camp-4", "paid"],
    ["demo-p-3", "demo-camp-1", "paid"], ["demo-p-3", "demo-camp-4", "paid"],
    ["demo-p-4", "demo-camp-3", "paid"], ["demo-p-4", "demo-camp-4", "paid"],
    ["demo-p-5", "demo-camp-1", "paid"], ["demo-p-6", "demo-camp-2", "pending"],
    ["demo-p-7", "demo-camp-3", "paid"], ["demo-p-8", "demo-camp-1", "pending"],
  ];
  const registrations: Registration[] = plan.map(([participantId, campId, state], index) => {
    const camp = camps.find((item) => item.id === campId)!;
    const paid = state === "paid";
    return {
      id: `demo-r-${index}`, campId, participantId,
      status: paid ? "registered" : "pending", paymentStatus: paid ? "paid" : "unpaid", amount: camp.price,
      paidOn: paid ? camp.startDate : "", expiresOn: paid ? camp.endDate : "",
      paymentMethod: paid ? "Cash" : "", paymentReference: "",
    };
  });
  const pastDays = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"];
  const sessions: CampSession[] = [
    { id: "demo-s-1", campId: "demo-camp-1", title: "Ball control & footwork", date: "2026-10-19", startTime: "09:00", endTime: "10:30" },
    { id: "demo-s-2", campId: "demo-camp-1", title: "Speed mechanics", date: "2026-10-19", startTime: "11:30", endTime: "12:30" },
    { id: "demo-s-3", campId: "demo-camp-1", title: "Small-sided match play", date: "2026-10-19", startTime: "14:00", endTime: "15:30" },
    { id: "demo-s-4", campId: "demo-camp-1", title: "Passing patterns", date: "2026-10-20", startTime: "09:00", endTime: "10:30" },
    { id: "demo-s-5", campId: "demo-camp-2", title: "Agility ladder circuits", date: "2026-10-26", startTime: "10:00", endTime: "11:30" },
    ...pastDays.map((date, index) => ({ id: `demo-past-${index}`, campId: "demo-camp-4", title: "Foundations training", date, startTime: "10:00", endTime: "11:30" })),
  ];
  const campFourAthletes = plan.filter(([, campId]) => campId === "demo-camp-4").map(([participantId]) => participantId);
  const attendance: AttendanceRecord[] = pastDays.flatMap((_, day) =>
    campFourAthletes.map((participantId, index) => {
      const status: AttendanceStatus = (day + index) % 5 === 0 ? "absent" : (day + index) % 7 === 3 ? "excused" : "present";
      return { sessionId: `demo-past-${day}`, participantId, status };
    }),
  );
  const vitals: VitalRecord[] = [
    { id: "demo-v-3", participantId: "demo-p-1", recordedOn: "2026-10-09", heightCm: 152, weightKg: 44.5, restingHeartRate: 72, systolic: 108, diastolic: 68, notes: "End of Foundations camp" },
    { id: "demo-v-2", participantId: "demo-p-1", recordedOn: "2026-10-05", heightCm: 151.5, weightKg: 45, restingHeartRate: 76, systolic: 110, diastolic: 70, notes: "" },
    { id: "demo-v-1", participantId: "demo-p-1", recordedOn: "2026-09-01", heightCm: 150, weightKg: 46, restingHeartRate: 80, systolic: 112, diastolic: 72, notes: "Baseline" },
  ];
  return { camps, participants, registrations, sessions, attendance, vitals };
}
