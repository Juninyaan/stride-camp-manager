"use client";

import { useEffect, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from "react";
import { useSupabase } from "@/lib/supabase-context";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  MapPin,
  Menu,
  Plus,
  Search,
  SlidersHorizontal,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type AttendanceStatus = "present" | "absent" | "excused";
type RegistrationStatus = "registered" | "waitlisted" | "withdrawn";
type CampColor = "mint" | "peach" | "lavender";

type Camp = {
  id: string;
  name: string;
  location: string;
  startDate: string;
  endDate: string;
  ageGroup: string;
  capacity: number;
};
type Participant = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  guardianName: string;
  guardianEmail: string;
};
type Registration = { id: string; campId: string; participantId: string; status: RegistrationStatus };
type CampSession = { id: string; campId: string; title: string; date: string; startTime: string; endTime: string };
type AttendanceRecord = { sessionId: string; participantId: string; status: AttendanceStatus };
type Modal =
  | { type: "camp" }
  | { type: "participant" }
  | { type: "session" }
  | { type: "attendance"; sessionId: string }
  | null;

const campColors: CampColor[] = ["mint", "peach", "lavender"];
const sessionColors: Record<CampColor, string> = {
  mint: "session-mint",
  peach: "session-peach",
  lavender: "session-lavender",
};
const avatarColors = ["avatar-rose", "avatar-blue", "avatar-gold", "avatar-violet"];
const attendanceOptions: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "excused", label: "Excused" },
];

// Demo-mode sample data, used only when Supabase is not configured.
const seedCamps: Camp[] = [
  { id: "demo-camp-1", name: "Junior Strikers", location: "Stride Performance Center", startDate: "2026-10-19", endDate: "2026-10-23", ageGroup: "Ages 8–12", capacity: 30 },
  { id: "demo-camp-2", name: "Speed & Agility Lab", location: "Northside Athletics Field", startDate: "2026-10-26", endDate: "2026-10-30", ageGroup: "Ages 13–17", capacity: 20 },
  { id: "demo-camp-3", name: "All-Star Skills Week", location: "Stride Performance Center", startDate: "2026-11-02", endDate: "2026-11-06", ageGroup: "Ages 10–14", capacity: 32 },
  { id: "demo-camp-4", name: "Foundations Kickoff", location: "Eastside Community Field", startDate: "2026-10-05", endDate: "2026-10-09", ageGroup: "Ages 9–13", capacity: 28 },
];
const seedParticipants: Participant[] = [
  ["Olivia", "Rhye"], ["Phoenix", "Baker"], ["Lana", "Steiner"], ["Demi", "Wilkinson"],
  ["Candice", "Wu"], ["Natali", "Craig"], ["Drew", "Cano"], ["Orlando", "Diggs"],
].map(([firstName, lastName], index) => ({
  id: `demo-p-${index + 1}`, firstName, lastName, email: "", guardianName: "", guardianEmail: "",
}));
const registrationPairs: [string, string][] = [
  ["demo-p-1", "demo-camp-1"], ["demo-p-1", "demo-camp-4"], ["demo-p-2", "demo-camp-2"], ["demo-p-2", "demo-camp-4"],
  ["demo-p-3", "demo-camp-1"], ["demo-p-3", "demo-camp-4"], ["demo-p-4", "demo-camp-3"], ["demo-p-4", "demo-camp-4"],
  ["demo-p-5", "demo-camp-1"], ["demo-p-6", "demo-camp-2"], ["demo-p-7", "demo-camp-3"], ["demo-p-8", "demo-camp-1"],
];
const seedRegistrations: Registration[] = registrationPairs.map(([participantId, campId], index) => ({
  id: `demo-r-${index}`, campId, participantId, status: "registered",
}));
const pastDays = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"];
const seedSessions: CampSession[] = [
  { id: "demo-s-1", campId: "demo-camp-1", title: "Ball control & footwork", date: "2026-10-19", startTime: "09:00", endTime: "10:30" },
  { id: "demo-s-2", campId: "demo-camp-1", title: "Speed mechanics", date: "2026-10-19", startTime: "11:30", endTime: "12:30" },
  { id: "demo-s-3", campId: "demo-camp-1", title: "Small-sided match play", date: "2026-10-19", startTime: "14:00", endTime: "15:30" },
  { id: "demo-s-4", campId: "demo-camp-1", title: "Passing patterns", date: "2026-10-20", startTime: "09:00", endTime: "10:30" },
  { id: "demo-s-5", campId: "demo-camp-2", title: "Agility ladder circuits", date: "2026-10-26", startTime: "10:00", endTime: "11:30" },
  ...pastDays.map((date, index) => ({
    id: `demo-past-${index}`, campId: "demo-camp-4", title: "Foundations training", date, startTime: "10:00", endTime: "11:30",
  })),
];
const seedCampFourParticipants = registrationPairs.filter(([, campId]) => campId === "demo-camp-4").map(([id]) => id);
const seedAttendance: AttendanceRecord[] = pastDays.flatMap((_, day) =>
  seedCampFourParticipants.map((participantId, index) => {
    const status: AttendanceStatus = (day + index) % 5 === 0 ? "absent" : (day + index) % 7 === 3 ? "excused" : "present";
    return { sessionId: `demo-past-${day}`, participantId, status };
  }),
);

const pad = (value: number) => String(value).padStart(2, "0");

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date: string, days: number) {
  const result = new Date(`${date}T12:00:00`);
  result.setDate(result.getDate() + days);
  return localDate(result);
}

function startOfWeek(date: string) {
  const day = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
  return addDays(date, -day);
}

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatLongDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function formatTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return { time: `${pad(hours % 12 || 12)}:${pad(minutes)}`, period: hours >= 12 ? "PM" : "AM" };
}

function toIso(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

function sortCamps(list: Camp[]) {
  return [...list].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function sortSessions(list: CampSession[]) {
  return [...list].sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
}

function fullName(person: { firstName: string; lastName: string }) {
  return `${person.firstName} ${person.lastName}`;
}

function avatarFor(name: string) {
  const total = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return avatarColors[total % avatarColors.length];
}

export default function Home() {
  const { client, session } = useSupabase();

  const [camps, setCamps] = useState<Camp[]>(client ? [] : seedCamps);
  const [participants, setParticipants] = useState<Participant[]>(client ? [] : seedParticipants);
  const [registrations, setRegistrations] = useState<Registration[]>(client ? [] : seedRegistrations);
  const [sessions, setSessions] = useState<CampSession[]>(client ? [] : seedSessions);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(client ? [] : seedAttendance);

  const [dataLoading, setDataLoading] = useState(Boolean(client));
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [formError, setFormError] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [editingCamp, setEditingCamp] = useState<Camp | null>(null);
  const [attendanceDraft, setAttendanceDraft] = useState<Record<string, AttendanceStatus>>({});
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [campFilter, setCampFilter] = useState("");
  const [showAllCamps, setShowAllCamps] = useState(false);
  const [participantQuery, setParticipantQuery] = useState("");
  const [participantCampFilter, setParticipantCampFilter] = useState("");
  const [showAllParticipants, setShowAllParticipants] = useState(false);
  const [showFullSchedule, setShowFullSchedule] = useState(false);

  useEffect(() => {
    if (!client || !session) return;

    let current = true;
    Promise.all([
      client.from("camps").select("id, name, location, start_date, end_date, age_group, capacity").order("start_date", { ascending: true }),
      client.from("participants").select("id, first_name, last_name, email, guardian_name, guardian_email").order("created_at", { ascending: false }),
      client.from("camp_registrations").select("id, camp_id, participant_id, status"),
      client.from("sessions").select("id, camp_id, title, starts_at, ends_at").order("starts_at", { ascending: true }),
      client.from("attendance").select("session_id, participant_id, status"),
    ])
      .then(([campResult, participantResult, registrationResult, sessionResult, attendanceResult]) => {
        if (!current) return;
        const failed = [campResult, participantResult, registrationResult, sessionResult, attendanceResult].find((result) => result.error);
        if (failed?.error) {
          setPageError(`Could not load your data: ${failed.error.message}`);
          setDataLoading(false);
          return;
        }

        setPageError("");
        setCamps((campResult.data ?? []).map((row) => ({
          id: row.id, name: row.name, location: row.location, startDate: row.start_date,
          endDate: row.end_date, ageGroup: row.age_group, capacity: row.capacity,
        })));
        setParticipants((participantResult.data ?? []).map((row) => ({
          id: row.id, firstName: row.first_name, lastName: row.last_name, email: row.email ?? "",
          guardianName: row.guardian_name ?? "", guardianEmail: row.guardian_email ?? "",
        })));
        setRegistrations((registrationResult.data ?? []).map((row) => ({
          id: row.id, campId: row.camp_id, participantId: row.participant_id, status: row.status,
        })));
        setSessions((sessionResult.data ?? []).map((row) => {
          const start = new Date(row.starts_at);
          const end = new Date(row.ends_at);
          return {
            id: row.id, campId: row.camp_id, title: row.title, date: localDate(start),
            startTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
            endTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
          };
        }));
        setAttendance((attendanceResult.data ?? []).map((row) => ({
          sessionId: row.session_id, participantId: row.participant_id, status: row.status,
        })));
        setDataLoading(false);
      })
      .catch((error: unknown) => {
        if (!current) return;
        setPageError(`Could not load your data: ${error instanceof Error ? error.message : "Unknown error"}`);
        setDataLoading(false);
      });

    return () => { current = false; };
  }, [client, session]);

  useEffect(() => {
    if (!modal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModal(null);
        setEditingCamp(null);
        setFormError("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal]);

  function closeModal() {
    setModal(null);
    setEditingCamp(null);
    setFormError("");
  }

  function openModal(next: NonNullable<Modal>) {
    setFormError("");
    setModal(next);
  }

  function backdropClose(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) closeModal();
  }

  const today = localDate();
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);

  const registeredByCamp = new Map<string, number>();
  const waitlistedByCamp = new Map<string, number>();
  registrations.forEach((registration) => {
    const target = registration.status === "registered" ? registeredByCamp : registration.status === "waitlisted" ? waitlistedByCamp : null;
    target?.set(registration.campId, (target.get(registration.campId) ?? 0) + 1);
  });

  const campViews = camps.map((camp, index) => {
    const enrolled = registeredByCamp.get(camp.id) ?? 0;
    const waitlisted = waitlistedByCamp.get(camp.id) ?? 0;
    const status = camp.endDate < today ? "Completed" : enrolled >= camp.capacity ? "Full" : enrolled / camp.capacity >= 0.85 ? "Almost full" : "Open";
    return { ...camp, enrolled, waitlisted, status, color: campColors[index % campColors.length] };
  });
  const campById = new Map(campViews.map((camp) => [camp.id, camp]));

  const activeCampCount = camps.filter((camp) => camp.endDate >= today).length;
  const campQuery = campFilter.trim().toLowerCase();
  const visibleCamps = campViews.filter((camp) =>
    `${camp.name} ${camp.location}`.toLowerCase().includes(campQuery) && (showAllCamps || camp.endDate >= today));

  const participantRows = participants.map((participant) => {
    const memberships = registrations.filter((item) => item.participantId === participant.id && item.status !== "withdrawn");
    const marks = attendance.filter((item) => item.participantId === participant.id);
    const present = marks.filter((item) => item.status === "present").length;
    return {
      ...participant,
      campIds: memberships.map((item) => item.campId),
      campNames: memberships.map((item) => campById.get(item.campId)?.name).filter(Boolean).join(", "),
      rate: marks.length ? Math.round((present / marks.length) * 100) : null,
      status: memberships.some((item) => item.status === "registered") ? "Registered" : memberships.length ? "Waitlisted" : "Not enrolled",
    };
  });
  const participantTerm = participantQuery.trim().toLowerCase();
  const filteredParticipants = participantRows.filter((row) =>
    (!participantCampFilter || row.campIds.includes(participantCampFilter)) &&
    (!participantTerm || `${fullName(row)} ${row.campNames}`.toLowerCase().includes(participantTerm)));
  const shownParticipants = showAllParticipants ? filteredParticipants : filteredParticipants.slice(0, 5);

  const sortedSessions = sortSessions(sessions);
  const upcomingSessions = sortedSessions.filter((item) => item.date >= today);
  const nextDay = upcomingSessions[0]?.date;
  const nextDaySessions = upcomingSessions.filter((item) => item.date === nextDay);
  const shownSessions = showFullSchedule ? upcomingSessions : nextDaySessions;
  const sessionsThisWeek = sessions.filter((item) => item.date >= weekStart && item.date <= weekEnd).length;
  const sessionsToday = sessions.filter((item) => item.date === today).length;

  const sessionDateById = new Map(sessions.map((item) => [item.id, item.date]));
  const attendanceByDate = new Map<string, { present: number; total: number }>();
  attendance.forEach((record) => {
    const date = sessionDateById.get(record.sessionId);
    if (!date) return;
    const entry = attendanceByDate.get(date) ?? { present: 0, total: 0 };
    entry.total += 1;
    if (record.status === "present") entry.present += 1;
    attendanceByDate.set(date, entry);
  });
  const chartData = [...attendanceByDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-7)
    .map(([date, entry]) => ({ day: formatDate(date), attendance: Math.round((entry.present / entry.total) * 100) }));
  const presentTotal = attendance.filter((item) => item.status === "present").length;
  const overallRate = attendance.length ? Math.round((presentTotal / attendance.length) * 100) : null;

  const attendanceSession = modal?.type === "attendance" ? sessions.find((item) => item.id === modal.sessionId) : undefined;
  const attendanceRoster = attendanceSession
    ? participants
        .filter((participant) => registrations.some((item) =>
          item.participantId === participant.id && item.campId === attendanceSession.campId && item.status === "registered"))
        .sort((a, b) => a.lastName.localeCompare(b.lastName))
    : [];

  const displayName = client ? (session?.user.email?.split("@")[0] ?? "there") : "Jordan";
  const openCamps = campViews.filter((camp) => camp.status !== "Completed");

  async function saveCamp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = {
      name: String(form.get("name")).trim(),
      location: String(form.get("location")).trim(),
      startDate: String(form.get("startDate")),
      endDate: String(form.get("endDate")),
      ageGroup: String(form.get("ageGroup")).trim(),
      capacity: Number(form.get("capacity")),
    };

    if (values.endDate < values.startDate) {
      setFormError("The camp end date must be on or after its start date.");
      return;
    }

    setSaving(true);
    setFormError("");
    let id = editingCamp?.id ?? crypto.randomUUID();
    if (client && session) {
      const row = {
        name: values.name, location: values.location, start_date: values.startDate,
        end_date: values.endDate, age_group: values.ageGroup, capacity: values.capacity,
      };
      const result = editingCamp
        ? await client.from("camps").update(row).eq("id", editingCamp.id).select("id").single()
        : await client.from("camps").insert(row).select("id").single();
      if (result.error) {
        setFormError(`Could not save camp: ${result.error.message}`);
        setSaving(false);
        return;
      }
      id = result.data.id;
    }

    setCamps((current) => sortCamps([...current.filter((camp) => camp.id !== id), { id, ...values }]));
    setSaving(false);
    closeModal();
  }

  async function deleteCamp(camp: Camp) {
    if (!window.confirm(`Delete “${camp.name}”? Its sessions and registrations will also be removed.`)) return;
    setPageError("");
    if (client && session) {
      const { error } = await client.from("camps").delete().eq("id", camp.id);
      if (error) {
        setPageError(`Could not delete camp: ${error.message}`);
        return;
      }
    }
    const removedSessions = new Set(sessions.filter((item) => item.campId === camp.id).map((item) => item.id));
    setCamps((current) => current.filter((item) => item.id !== camp.id));
    setRegistrations((current) => current.filter((item) => item.campId !== camp.id));
    setSessions((current) => current.filter((item) => item.campId !== camp.id));
    setAttendance((current) => current.filter((item) => !removedSessions.has(item.sessionId)));
    if (participantCampFilter === camp.id) setParticipantCampFilter("");
  }

  async function saveParticipant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = {
      firstName: String(form.get("firstName")).trim(),
      lastName: String(form.get("lastName")).trim(),
      email: String(form.get("email")).trim(),
      guardianName: String(form.get("guardianName")).trim(),
      guardianEmail: String(form.get("guardianEmail")).trim(),
    };
    const campId = String(form.get("campId") ?? "");
    const targetCamp = campViews.find((camp) => camp.id === campId);
    const status: RegistrationStatus = targetCamp && targetCamp.enrolled >= targetCamp.capacity ? "waitlisted" : "registered";

    setSaving(true);
    setFormError("");
    let id = crypto.randomUUID();
    let registrationId = crypto.randomUUID();
    let registrationFailed = "";
    if (client && session) {
      const inserted = await client.from("participants").insert({
        first_name: values.firstName, last_name: values.lastName, email: values.email || null,
        guardian_name: values.guardianName || null, guardian_email: values.guardianEmail || null,
      }).select("id").single();
      if (inserted.error) {
        setFormError(`Could not add athlete: ${inserted.error.message}`);
        setSaving(false);
        return;
      }
      id = inserted.data.id;

      if (campId) {
        const registered = await client.from("camp_registrations")
          .insert({ camp_id: campId, participant_id: id, status }).select("id").single();
        if (registered.error) registrationFailed = registered.error.message;
        else registrationId = registered.data.id;
      }
    }

    setParticipants((current) => [{ id, ...values }, ...current]);
    if (campId && !registrationFailed) {
      setRegistrations((current) => [...current, { id: registrationId, campId, participantId: id, status }]);
    }
    if (registrationFailed) setPageError(`The athlete was added, but camp registration failed: ${registrationFailed}`);
    setSaving(false);
    closeModal();
  }

  async function deleteParticipant(participant: Participant) {
    if (!window.confirm(`Remove ${fullName(participant)}? Their registrations and attendance will also be removed.`)) return;
    setPageError("");
    if (client && session) {
      const { error } = await client.from("participants").delete().eq("id", participant.id);
      if (error) {
        setPageError(`Could not remove athlete: ${error.message}`);
        return;
      }
    }
    setParticipants((current) => current.filter((item) => item.id !== participant.id));
    setRegistrations((current) => current.filter((item) => item.participantId !== participant.id));
    setAttendance((current) => current.filter((item) => item.participantId !== participant.id));
  }

  async function saveSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = {
      campId: String(form.get("campId")),
      title: String(form.get("title")).trim(),
      date: String(form.get("date")),
      startTime: String(form.get("startTime")),
      endTime: String(form.get("endTime")),
    };
    const camp = camps.find((item) => item.id === values.campId);

    if (!camp) {
      setFormError("Choose a camp for this session.");
      return;
    }
    if (values.date < camp.startDate || values.date > camp.endDate) {
      setFormError(`The session date must fall within the camp dates (${formatDate(camp.startDate)} – ${formatDate(camp.endDate)}).`);
      return;
    }
    if (values.endTime <= values.startTime) {
      setFormError("The end time must be after the start time.");
      return;
    }

    setSaving(true);
    setFormError("");
    let id = crypto.randomUUID();
    if (client && session) {
      const inserted = await client.from("sessions").insert({
        camp_id: values.campId, title: values.title,
        starts_at: toIso(values.date, values.startTime), ends_at: toIso(values.date, values.endTime),
      }).select("id").single();
      if (inserted.error) {
        setFormError(`Could not add session: ${inserted.error.message}`);
        setSaving(false);
        return;
      }
      id = inserted.data.id;
    }

    setSessions((current) => [...current, { id, ...values }]);
    setSaving(false);
    closeModal();
  }

  async function deleteSession(target: CampSession) {
    if (!window.confirm(`Delete the session “${target.title}”? Its attendance records will also be removed.`)) return;
    setFormError("");
    if (client && session) {
      const { error } = await client.from("sessions").delete().eq("id", target.id);
      if (error) {
        setFormError(`Could not delete session: ${error.message}`);
        return;
      }
    }
    setSessions((current) => current.filter((item) => item.id !== target.id));
    setAttendance((current) => current.filter((item) => item.sessionId !== target.id));
    closeModal();
  }

  function openAttendance(sessionId: string) {
    const draft: Record<string, AttendanceStatus> = {};
    attendance.filter((item) => item.sessionId === sessionId).forEach((item) => { draft[item.participantId] = item.status; });
    setAttendanceDraft(draft);
    openModal({ type: "attendance", sessionId });
  }

  function setDraftStatus(participantId: string, status: AttendanceStatus) {
    setAttendanceDraft((current) => {
      const next = { ...current };
      if (next[participantId] === status) delete next[participantId];
      else next[participantId] = status;
      return next;
    });
  }

  async function saveAttendance() {
    if (!attendanceSession) return;
    const sessionId = attendanceSession.id;
    const entries = Object.entries(attendanceDraft) as [string, AttendanceStatus][];
    const markedIds = entries.map(([participantId]) => participantId);
    const clearedIds = attendance
      .filter((item) => item.sessionId === sessionId && !markedIds.includes(item.participantId))
      .map((item) => item.participantId);

    setSaving(true);
    setFormError("");
    if (client && session) {
      if (entries.length) {
        const { error } = await client.from("attendance").upsert(
          entries.map(([participantId, status]) => ({ session_id: sessionId, participant_id: participantId, status })),
          { onConflict: "session_id,participant_id" },
        );
        if (error) {
          setFormError(`Could not save attendance: ${error.message}`);
          setSaving(false);
          return;
        }
      }
      if (clearedIds.length) {
        const { error } = await client.from("attendance").delete().eq("session_id", sessionId).in("participant_id", clearedIds);
        if (error) {
          setFormError(`Could not save attendance: ${error.message}`);
          setSaving(false);
          return;
        }
      }
    }

    setAttendance((current) => [
      ...current.filter((item) => item.sessionId !== sessionId),
      ...entries.map(([participantId, status]) => ({ sessionId, participantId, status })),
    ]);
    setSaving(false);
    closeModal();
  }

  function showCampParticipants(campId: string) {
    setParticipantCampFilter(campId);
    setParticipantQuery("");
    setShowAllParticipants(true);
    document.getElementById("participants")?.scrollIntoView({ behavior: "smooth" });
  }

  const nextDayLabel = nextDay
    ? { month: new Date(`${nextDay}T12:00:00`).toLocaleDateString("en-US", { month: "short" }).toUpperCase(), day: new Date(`${nextDay}T12:00:00`).getDate() }
    : null;
  const filteredCampName = participantCampFilter ? campById.get(participantCampFilter)?.name : undefined;

  return (
    <div className="app-shell" id="top">
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <a className="brand" href="#top" aria-label="Stride home">
          <span className="brand-mark"><Activity size={20} strokeWidth={2.6} /></span>
          <span>stride<span className="brand-light">camp</span></span>
        </a>

        <div className="workspace-switcher">
          <div className="workspace-avatar">S</div>
          <div className="workspace-copy"><strong>Stride Athletics</strong><span>{client ? session?.user.email : "Demo workspace"}</span></div>
        </div>

        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation" className="main-nav">
          <a className="nav-link nav-link-active" href="#top" onClick={() => setMobileNavOpen(false)}><Activity size={18} />Overview</a>
          <a className="nav-link" href="#camps" onClick={() => setMobileNavOpen(false)}><CalendarDays size={18} />Camps<span className="nav-count">{camps.length}</span></a>
          <a className="nav-link" href="#participants" onClick={() => setMobileNavOpen(false)}><Users size={18} />Participants<span className="nav-count">{participants.length}</span></a>
          <a className="nav-link" href="#schedule" onClick={() => setMobileNavOpen(false)}><Clock3 size={18} />Schedule</a>
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon"><Activity size={16} /></div>
            <strong>Keep your camps moving</strong>
            <p>Add sessions to your schedule, then take attendance as athletes arrive.</p>
            <a href="#schedule" onClick={() => setMobileNavOpen(false)}>View schedule <ArrowRight size={14} /></a>
          </div>
          {client ? (
            <button className="profile-button" onClick={() => client.auth.signOut()} type="button">
              <span className="profile-avatar">{session?.user.email?.slice(0, 2).toUpperCase() ?? "AC"}</span>
              <span className="profile-copy"><strong>{session?.user.email}</strong><span>Click to sign out</span></span>
            </button>
          ) : (
            <div className="profile-button">
              <span className="profile-avatar">JD</span>
              <span className="profile-copy"><strong>Jordan Davis</strong><span>Demo admin</span></span>
            </div>
          )}
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileNavOpen(!mobileNavOpen)} aria-label="Toggle navigation" type="button">
            {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="breadcrumbs"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>Overview</strong></div>
          <div className="topbar-actions">
            <label className="global-search"><Search size={17} /><input aria-label="Search camps" placeholder="Search camps..." value={campFilter} onChange={(event) => setCampFilter(event.target.value)} /></label>
            <span className="topbar-avatar" aria-label={client ? (session?.user.email ?? "Account") : "Jordan Davis"}>{client ? (session?.user.email?.slice(0, 2).toUpperCase() ?? "AC") : "JD"}</span>
          </div>
        </header>

        <div className="dashboard-content">
          <section className="welcome-row">
            <div>
              <div className="eyebrow"><span className="live-dot" />{client ? `CONNECTED · ${formatLongDate(today).toUpperCase()}` : "DEMO MODE · SAMPLE DATA"}</div>
              <h1>Your week at a glance, {displayName}</h1>
              <p>Here&apos;s what&apos;s coming up across your camps.</p>
            </div>
            <div className="welcome-actions">
              <button className="secondary-button" type="button" onClick={() => openModal({ type: "participant" })}><UserPlus size={17} />Add athlete</button>
              <button className="primary-button" type="button" onClick={() => { setEditingCamp(null); openModal({ type: "camp" }); }}><Plus size={18} />Create a camp</button>
            </div>
          </section>

          {pageError && <p className="camp-alert" role="alert">{pageError}</p>}
          {dataLoading && <p className="camp-alert camp-alert-info" role="status">Loading your data…</p>}

          <section className="stats-grid" aria-label="Camp overview">
            <article className="stat-card">
              <div className="stat-top"><span>Active camps</span><span className="stat-icon stat-icon-mint"><CalendarDays size={17} /></span></div>
              <div className="stat-value">{activeCampCount}</div>
              <p className="stat-foot">{camps.length - activeCampCount} completed</p>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span>Registered athletes</span><span className="stat-icon stat-icon-lavender"><Users size={17} /></span></div>
              <div className="stat-value">{participants.length}</div>
              <p className="stat-foot">{registrations.filter((item) => item.status === "registered").length} camp registrations</p>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span>Sessions this week</span><span className="stat-icon stat-icon-peach"><Clock3 size={17} /></span></div>
              <div className="stat-value">{sessionsThisWeek}<span className="stat-unit">sessions</span></div>
              <p className="stat-foot">{sessionsToday} scheduled for today</p>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span>Average attendance</span><span className="stat-icon stat-icon-yellow"><Activity size={17} /></span></div>
              <div className="stat-value">{overallRate === null ? "—" : <>{overallRate}<span className="stat-unit">%</span></>}</div>
              <p className="stat-foot">{overallRate === null ? "No attendance recorded yet" : `${attendance.length} check-ins recorded`}</p>
            </article>
          </section>

          <section className="dashboard-grid">
            <article className="panel attendance-panel" id="insights">
              <div className="panel-heading">
                <div><h2>Attendance overview</h2><p>Present rate for your most recent session days</p></div>
              </div>
              <div className="chart-summary"><strong>{overallRate === null ? "—" : `${overallRate}%`}</strong><span className="chart-compared">overall present rate</span></div>
              <div className="chart-wrap">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 12, right: 4, left: -24, bottom: 0 }}>
                      <defs><linearGradient id="attendanceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5a806b" stopOpacity={0.22} /><stop offset="100%" stopColor="#5a806b" stopOpacity={0.01} /></linearGradient></defs>
                      <CartesianGrid vertical={false} stroke="#edf0eb" strokeDasharray="4 5" />
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#89918a", fontSize: 12 }} dy={10} />
                      <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: "#89918a", fontSize: 11 }} tickFormatter={(value: number) => `${value}%`} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #edf0eb", boxShadow: "0 8px 24px #28352b14", fontSize: 12 }} formatter={(value) => [`${value}%`, "Present"]} />
                      <Area type="monotone" dataKey="attendance" stroke="#527b62" strokeWidth={2.5} fill="url(#attendanceFill)" activeDot={{ r: 5, strokeWidth: 0, fill: "#527b62" }} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <div className="empty-state">No attendance recorded yet. Open a session in the schedule and mark who attended.</div>}
              </div>
              <div className="chart-legend"><span className="legend-dot" />Present rate{!client && <span className="chart-note">Sample data</span>}</div>
            </article>

            <article className="panel schedule-panel" id="schedule">
              <div className="panel-heading">
                <div>
                  <h2>{showFullSchedule ? "Upcoming schedule" : nextDay === today ? "Today's schedule" : "Next camp day"}</h2>
                  <p>{showFullSchedule ? `${upcomingSessions.length} upcoming sessions` : nextDay ? formatLongDate(nextDay) : "Nothing scheduled"}</p>
                </div>
                <div className="panel-actions">
                  {upcomingSessions.length > nextDaySessions.length && (
                    <button className="text-link" type="button" onClick={() => setShowFullSchedule(!showFullSchedule)}>{showFullSchedule ? "Show less" : "Full schedule"} <ArrowRight size={15} /></button>
                  )}
                  <button className="secondary-button small-button" type="button" onClick={() => openModal({ type: "session" })}><Plus size={14} />Session</button>
                </div>
              </div>
              {nextDay && nextDayLabel && !showFullSchedule && (
                <div className="schedule-date">
                  <div className="date-tile"><span>{nextDayLabel.month}</span><strong>{nextDayLabel.day}</strong></div>
                  <div><strong>{nextDaySessions.length} {nextDaySessions.length === 1 ? "session" : "sessions"}</strong><span>{new Date(`${nextDay}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" })}</span></div>
                  <span className="today-pill">{nextDay === today ? "Today" : "Next up"}</span>
                </div>
              )}
              <div className="session-list">
                {shownSessions.length === 0 && (
                  <div className="empty-state">
                    {dataLoading ? "Loading sessions…" : openCamps.length === 0 ? "Create a camp first, then add sessions to it." : "No upcoming sessions. Add a session to start building your schedule."}
                  </div>
                )}
                {shownSessions.map((item) => {
                  const start = formatTime(item.startTime);
                  const camp = campById.get(item.campId);
                  const marked = attendance.filter((record) => record.sessionId === item.id).length;
                  const rosterSize = registeredByCamp.get(item.campId) ?? 0;
                  return (
                    <div className="session-item" key={item.id}>
                      <div className="session-time"><strong>{start.time}</strong><span>{start.period}</span></div>
                      <span className={`session-marker ${sessionColors[camp?.color ?? "mint"]}`} />
                      <div className="session-copy"><strong>{item.title}</strong><span>{showFullSchedule ? `${formatDate(item.date)} · ` : ""}{camp?.name ?? "Camp"}</span></div>
                      <button className="session-action" type="button" onClick={() => openAttendance(item.id)} aria-label={`Take attendance for ${item.title}`}>
                        <Check size={13} />{marked}/{rosterSize}
                      </button>
                    </div>
                  );
                })}
              </div>
            </article>
          </section>

          <section className="panel camps-panel" id="camps">
            <div className="panel-heading camps-heading">
              <div><h2>Your camps</h2><p>Keep track of your programs and enrollment</p></div>
              <div className="panel-actions">
                <button className="select-button filter-button" type="button" onClick={() => setShowAllCamps(!showAllCamps)}><SlidersHorizontal size={15} />{showAllCamps ? "All camps" : "Upcoming"}<ChevronDown size={14} /></button>
                <button className="secondary-button" type="button" onClick={() => { setEditingCamp(null); openModal({ type: "camp" }); }}><Plus size={16} />New camp</button>
              </div>
            </div>
            {visibleCamps.length > 0 ? (
              <div className="camp-grid">
                {visibleCamps.map((camp) => {
                  const fill = Math.min((camp.enrolled / camp.capacity) * 100, 100);
                  return (
                    <article className="camp-card" key={camp.id}>
                      <div className={`camp-card-art art-${camp.color}`}><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-label">STRIDE <span>ATHLETICS</span></div><div className="art-number">{String(campViews.indexOf(camp) + 1).padStart(2, "0")}</div></div>
                      <div className="camp-card-body">
                        <div className="camp-title-row"><h3>{camp.name}</h3><span className={`status-pill status-${camp.status.toLowerCase().replace(" ", "-")}`}><span />{camp.status}</span></div>
                        <div className="camp-meta"><span><CalendarDays size={14} />{formatDate(camp.startDate)} – {formatDate(camp.endDate)}</span><span><MapPin size={14} />{camp.location}</span></div>
                        <div className="camp-capacity"><div className="capacity-label"><span>{camp.ageGroup}</span><span><strong>{camp.enrolled}</strong> / {camp.capacity} athletes{camp.waitlisted > 0 ? ` · ${camp.waitlisted} waitlisted` : ""}</span></div><div className="progress-track"><span style={{ width: `${fill}%` }} /></div></div>
                        <div className="camp-detail-actions">
                          <button className="camp-details" onClick={() => showCampParticipants(camp.id)} type="button">Athletes <ArrowRight size={15} /></button>
                          <div className="camp-link-actions">
                            <button className="camp-edit" onClick={() => { setEditingCamp(camp); openModal({ type: "camp" }); }} type="button">Edit</button>
                            <button aria-label={`Delete ${camp.name}`} className="camp-delete" onClick={() => deleteCamp(camp)} type="button">Delete</button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                {dataLoading ? "Loading your camps…" : camps.length === 0 ? "No camps yet. Create your first camp to get started." : "No camps match that search or filter."}
              </div>
            )}
            <div className="panel-footer"><span>Showing {visibleCamps.length} of {camps.length} camps</span>{!showAllCamps && camps.length > visibleCamps.length && <button className="text-link" type="button" onClick={() => setShowAllCamps(true)}>View all camps <ArrowRight size={15} /></button>}</div>
          </section>

          <section className="panel participants-panel" id="participants">
            <div className="panel-heading participants-heading">
              <div><h2>Participants</h2><p>Athletes registered with your camps</p></div>
              <div className="panel-actions">
                <label className="participant-search"><Search size={14} /><input aria-label="Search athletes" placeholder="Search athletes..." value={participantQuery} onChange={(event) => setParticipantQuery(event.target.value)} /></label>
                <button className="secondary-button" type="button" onClick={() => openModal({ type: "participant" })}><UserPlus size={16} />Add athlete</button>
              </div>
            </div>
            {filteredCampName && (
              <div className="filter-chip"><span>Camp: {filteredCampName}</span><button aria-label="Clear camp filter" type="button" onClick={() => setParticipantCampFilter("")}><X size={13} /></button></div>
            )}
            {shownParticipants.length > 0 ? (
              <div className="participant-table-wrap">
                <table className="participant-table">
                  <thead><tr><th>ATHLETE</th><th>CAMP</th><th>ATTENDANCE</th><th>STATUS</th><th><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>{shownParticipants.map((participant) => (
                    <tr key={participant.id}>
                      <td><div className="athlete-cell"><span className={`athlete-avatar ${avatarFor(fullName(participant))}`}>{`${participant.firstName[0] ?? ""}${participant.lastName[0] ?? ""}`.toUpperCase()}</span><strong>{fullName(participant)}</strong></div></td>
                      <td>{participant.campNames || "—"}</td>
                      <td>{participant.rate === null ? "—" : <span className="attendance-cell"><span className="mini-progress"><span style={{ width: `${participant.rate}%` }} /></span>{participant.rate}%</span>}</td>
                      <td><span className={`participant-status ${participant.status === "Registered" ? "" : "participant-status-muted"}`}>{participant.status === "Registered" && <Check size={12} />}{participant.status}</span></td>
                      <td><button className="row-delete" aria-label={`Remove ${fullName(participant)}`} onClick={() => deleteParticipant(participant)} type="button">Remove</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                {dataLoading ? "Loading athletes…" : participants.length === 0 ? "No athletes yet. Add your first athlete and register them for a camp." : "No athletes match that search or filter."}
              </div>
            )}
            <div className="panel-footer">
              <span>Showing {shownParticipants.length} of {filteredParticipants.length} athletes</span>
              {filteredParticipants.length > 5 && (
                <button className="text-link" type="button" onClick={() => setShowAllParticipants(!showAllParticipants)}>{showAllParticipants ? "Show fewer" : "View all participants"} <ArrowRight size={15} /></button>
              )}
            </div>
          </section>

          <footer className="dashboard-footer"><span>© 2026 Stride Camp Manager</span><span><span className="footer-dot" />{client ? "Supabase connected" : "Demo mode"}</span><span>{client ? "Your data is private to your account" : "Sample data · Not saved"}</span></footer>
        </div>
      </main>

      {modal?.type === "camp" && (
        <div className="modal-backdrop" onMouseDown={backdropClose}>
          <section aria-labelledby="camp-title" aria-modal="true" className="camp-modal" role="dialog">
            <div className="modal-heading"><div><span className="modal-icon"><CalendarDays size={18} /></span><h2 id="camp-title">{editingCamp ? "Edit camp" : "Create a camp"}</h2><p>{editingCamp ? "Update this camp's details." : "Add a new program to your workspace."}</p></div><button className="icon-button" aria-label="Close dialog" onClick={closeModal} type="button"><X size={19} /></button></div>
            <form className="camp-form" onSubmit={saveCamp}>
              <label>Camp name<input autoFocus defaultValue={editingCamp?.name} name="name" placeholder="e.g. Summer Skills Camp" required maxLength={120} /></label>
              <label>Location<input defaultValue={editingCamp?.location} name="location" placeholder="Facility or field" required maxLength={200} /></label>
              <div className="form-row"><label>Start date<input defaultValue={editingCamp?.startDate} name="startDate" type="date" required /></label><label>End date<input defaultValue={editingCamp?.endDate} name="endDate" type="date" required /></label></div>
              <div className="form-row"><label>Age group<input defaultValue={editingCamp?.ageGroup} name="ageGroup" placeholder="e.g. Ages 8–12" required maxLength={60} /></label><label>Capacity<input defaultValue={editingCamp?.capacity} min="1" name="capacity" type="number" placeholder="30" required /></label></div>
              {formError && <p className="camp-alert" role="alert">{formError}</p>}
              <div className="modal-actions"><button className="secondary-button" onClick={closeModal} type="button">Cancel</button><button className="primary-button" disabled={saving} type="submit">{saving ? "Saving…" : editingCamp ? "Save changes" : <><Plus size={17} />Create camp</>}</button></div>
              <p className="demo-note">{client ? "Saved to your private Supabase account." : "Demo only: changes are not saved after a refresh."}</p>
            </form>
          </section>
        </div>
      )}

      {modal?.type === "participant" && (
        <div className="modal-backdrop" onMouseDown={backdropClose}>
          <section aria-labelledby="participant-title" aria-modal="true" className="camp-modal" role="dialog">
            <div className="modal-heading"><div><span className="modal-icon"><UserPlus size={18} /></span><h2 id="participant-title">Add an athlete</h2><p>Register a participant and optionally enroll them in a camp.</p></div><button className="icon-button" aria-label="Close dialog" onClick={closeModal} type="button"><X size={19} /></button></div>
            <form className="camp-form" onSubmit={saveParticipant}>
              <div className="form-row"><label>First name<input autoFocus name="firstName" required maxLength={80} /></label><label>Last name<input name="lastName" required maxLength={80} /></label></div>
              <label>Athlete email (optional)<input name="email" type="email" placeholder="name@example.com" /></label>
              <div className="form-row"><label>Guardian name (optional)<input name="guardianName" /></label><label>Guardian email (optional)<input name="guardianEmail" type="email" /></label></div>
              <label>Register for a camp
                <select defaultValue="" name="campId">
                  <option value="">Register later</option>
                  {openCamps.map((camp) => (
                    <option key={camp.id} value={camp.id}>{camp.name}{camp.enrolled >= camp.capacity ? " (full — waitlist)" : ""}</option>
                  ))}
                </select>
              </label>
              {formError && <p className="camp-alert" role="alert">{formError}</p>}
              <div className="modal-actions"><button className="secondary-button" onClick={closeModal} type="button">Cancel</button><button className="primary-button" disabled={saving} type="submit">{saving ? "Saving…" : <><Plus size={17} />Add athlete</>}</button></div>
              <p className="demo-note">{client ? "Saved to your private Supabase account." : "Demo only: changes are not saved after a refresh."}</p>
            </form>
          </section>
        </div>
      )}

      {modal?.type === "session" && (
        <div className="modal-backdrop" onMouseDown={backdropClose}>
          <section aria-labelledby="session-title" aria-modal="true" className="camp-modal" role="dialog">
            <div className="modal-heading"><div><span className="modal-icon"><Clock3 size={18} /></span><h2 id="session-title">Add a session</h2><p>Schedule a training session within a camp.</p></div><button className="icon-button" aria-label="Close dialog" onClick={closeModal} type="button"><X size={19} /></button></div>
            {openCamps.length === 0 ? (
              <div className="empty-state">You need an active camp before you can add a session.</div>
            ) : (
              <form className="camp-form" onSubmit={saveSession}>
                <label>Camp
                  <select name="campId" required defaultValue={openCamps[0].id}>
                    {openCamps.map((camp) => <option key={camp.id} value={camp.id}>{camp.name} ({formatDate(camp.startDate)} – {formatDate(camp.endDate)})</option>)}
                  </select>
                </label>
                <label>Session title<input autoFocus name="title" placeholder="e.g. Ball control & footwork" required maxLength={120} /></label>
                <label>Date<input name="date" type="date" required /></label>
                <div className="form-row"><label>Start time<input name="startTime" type="time" required /></label><label>End time<input name="endTime" type="time" required /></label></div>
                {formError && <p className="camp-alert" role="alert">{formError}</p>}
                <div className="modal-actions"><button className="secondary-button" onClick={closeModal} type="button">Cancel</button><button className="primary-button" disabled={saving} type="submit">{saving ? "Saving…" : <><Plus size={17} />Add session</>}</button></div>
                <p className="demo-note">{client ? "Saved to your private Supabase account." : "Demo only: changes are not saved after a refresh."}</p>
              </form>
            )}
          </section>
        </div>
      )}

      {modal?.type === "attendance" && attendanceSession && (
        <div className="modal-backdrop" onMouseDown={backdropClose}>
          <section aria-labelledby="attendance-title" aria-modal="true" className="camp-modal attendance-modal" role="dialog">
            <div className="modal-heading"><div><span className="modal-icon"><Check size={18} /></span><h2 id="attendance-title">Take attendance</h2><p>{attendanceSession.title} · {formatDate(attendanceSession.date)} · {campById.get(attendanceSession.campId)?.name}</p></div><button className="icon-button" aria-label="Close dialog" onClick={closeModal} type="button"><X size={19} /></button></div>
            {attendanceRoster.length === 0 ? (
              <div className="empty-state">No athletes are registered in this camp yet. Add an athlete and register them for the camp first.</div>
            ) : (
              <>
                <div className="attendance-tools">
                  <button className="text-link" type="button" onClick={() => setAttendanceDraft(Object.fromEntries(attendanceRoster.map((athlete) => [athlete.id, "present" as AttendanceStatus])))}>Mark all present</button>
                  <button className="text-link" type="button" onClick={() => setAttendanceDraft({})}>Clear all</button>
                </div>
                <div className="attendance-list">
                  {attendanceRoster.map((athlete) => (
                    <div className="attendance-row" key={athlete.id}>
                      <div className="athlete-cell"><span className={`athlete-avatar ${avatarFor(fullName(athlete))}`}>{`${athlete.firstName[0] ?? ""}${athlete.lastName[0] ?? ""}`.toUpperCase()}</span><strong>{fullName(athlete)}</strong></div>
                      <div className="segmented" role="group" aria-label={`Attendance for ${fullName(athlete)}`}>
                        {attendanceOptions.map((option) => (
                          <button key={option.value} aria-pressed={attendanceDraft[athlete.id] === option.value} className={`segment segment-${option.value} ${attendanceDraft[athlete.id] === option.value ? "segment-active" : ""}`} onClick={() => setDraftStatus(athlete.id, option.value)} type="button">{option.label}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {formError && <p className="camp-alert" role="alert">{formError}</p>}
            <div className="modal-actions attendance-actions">
              <button className="camp-delete" onClick={() => deleteSession(attendanceSession)} type="button">Delete session</button>
              <span className="modal-actions-spacer" />
              <button className="secondary-button" onClick={closeModal} type="button">Cancel</button>
              <button className="primary-button" disabled={saving || attendanceRoster.length === 0} onClick={saveAttendance} type="button">{saving ? "Saving…" : "Save attendance"}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
