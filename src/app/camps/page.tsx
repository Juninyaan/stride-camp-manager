"use client";

import { Suspense, useEffect, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSupabase } from "@/lib/supabase-context";
import { AppShell } from "@/components/app-shell";
import { SessionImport } from "@/components/session-import";
import { Activity, Ban, CalendarDays, Check, Clock3, Copy, MapPin, Plus, RotateCcw, Tag, Users, X } from "lucide-react";
import {
  addDays,
  avatarFor,
  campDays,
  createRegistration,
  defaultSessionDays,
  emptyHealth,
  formatDate,
  formatDateYear,
  formatLongDate,
  formatMoney,
  formatTime,
  fullName,
  initialsOf,
  insertSessions,
  loadCampData,
  localDate,
  registrationView,
  saveAttendanceFor,
  seedData,
  sortSessions,
  startOfWeek,
  toIso,
  validateSession,
  weekdayLabel,
  withExpiry,
  type AttendanceRecord,
  type AttendanceStatus,
  type Camp,
  type CampSession,
  type Participant,
  type Registration,
} from "@/lib/camp-model";

type StatusFilter = "all" | "registered" | "pending" | "waitlisted" | "expired";
type SessionState = "cancelled" | "done" | "today" | "upcoming";
type Modal =
  | { type: "session"; editing?: CampSession; date?: string; reschedule?: boolean }
  | { type: "multi"; source?: CampSession }
  | { type: "attendance"; sessionId: string }
  | { type: "cancel"; sessionId: string }
  | { type: "manage-sessions" }
  | { type: "add-athlete" }
  | { type: "edit-athlete"; participantId: string }
  | null;

const statusOrder: Record<string, number> = { registered: 0, pending: 1, waitlisted: 2, expired: 3 };
const attendanceOptions: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "excused", label: "Excused" },
];
const reasonSuggestions = ["Heavy rain", "Bad weather", "Coach unavailable", "Venue unavailable"];
const weekdayHeads = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const stateLabels: Record<SessionState, string> = { cancelled: "Cancelled", done: "Done", today: "Today", upcoming: "Upcoming" };

function buildWeeks(camp: Camp) {
  const weeks: string[][] = [];
  const last = addDays(startOfWeek(camp.endDate), 6);
  for (let weekStart = startOfWeek(camp.startDate); weekStart <= last; weekStart = addDays(weekStart, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)));
  }
  return weeks;
}

function CampRoster() {
  const { client, session } = useSupabase();
  const liveClient = client && session ? client : null;
  const searchParams = useSearchParams();

  const [camps, setCamps] = useState<Camp[]>(() => (client ? [] : seedData().camps));
  const [participants, setParticipants] = useState<Participant[]>(() => (client ? [] : seedData().participants));
  const [registrations, setRegistrations] = useState<Registration[]>(() => (client ? [] : seedData().registrations));
  const [sessions, setSessions] = useState<CampSession[]>(() => (client ? [] : seedData().sessions));
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() => (client ? [] : seedData().attendance));
  const [dataLoading, setDataLoading] = useState(Boolean(client));
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [selectedId, setSelectedId] = useState(searchParams.get("id") ?? "");
  const [selectedDay, setSelectedDay] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [modal, setModal] = useState<Modal>(null);
  const [multiDays, setMultiDays] = useState<string[]>([]);
  const [attendanceDraft, setAttendanceDraft] = useState<Record<string, AttendanceStatus>>({});
  const [cancelReason, setCancelReason] = useState("");
  const [dragId, setDragId] = useState("");
  const [dragOverDay, setDragOverDay] = useState("");
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [athleteMode, setAthleteMode] = useState<"new" | "existing">("new");
  const [modalNotice, setModalNotice] = useState("");

  useEffect(() => {
    if (!client || !session) return;

    let current = true;
    loadCampData(client)
      .then((data) => {
        if (!current) return;
        setPageError("");
        setCamps(data.camps);
        setParticipants(data.participants);
        setRegistrations(data.registrations);
        setSessions(data.sessions);
        setAttendance(data.attendance);
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
      if (event.key === "Escape" && !saving) {
        setModal(null);
        setFormError("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal, saving]);

  function closeModal() {
    if (saving) return;
    setModal(null);
    setFormError("");
    setModalNotice("");
  }

  function openModal(next: NonNullable<Modal>) {
    setFormError("");
    setModalNotice("");
    setNotice("");
    setModal(next);
  }

  function backdropClose(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) closeModal();
  }

  function selectCamp(id: string) {
    setSelectedId(id);
    setSelectedDay("");
    setFilter("all");
    setNotice("");
    window.history.replaceState(null, "", `/camps?id=${id}`);
  }

  async function setSuccessor(camp: Camp, nextCampId: string) {
    setPageError("");
    setNotice("");
    setSaving(true);
    if (liveClient) {
      const { error } = await liveClient.from("camps").update({ next_camp_id: nextCampId || null }).eq("id", camp.id);
      if (error) {
        setPageError(`Could not update the next camp: ${error.message}`);
        setSaving(false);
        return;
      }
    }
    setCamps((current) => current.map((item) => item.id === camp.id ? { ...item, nextCampId } : item));
    setNotice(nextCampId ? "Next camp saved. Active athletes will roll over after this camp ends." : "Automatic rollover removed.");
    setSaving(false);
  }

  const today = localDate();
  const regs = registrations.map((registration) => withExpiry(registration, today));
  const participantById = new Map(participants.map((item) => [item.id, item]));

  const orderedCamps = [
    ...camps.filter((camp) => camp.endDate >= today),
    ...camps.filter((camp) => camp.endDate < today).reverse(),
  ];
  const selected = camps.find((camp) => camp.id === selectedId) ?? orderedCamps[0];

  const campRegs = selected ? regs.filter((item) => item.campId === selected.id && item.status !== "withdrawn") : [];
  const countOf = (status: Registration["status"]) => campRegs.filter((item) => item.status === status).length;
  const enrolled = countOf("registered");
  const awaiting = campRegs.filter((item) => item.paymentStatus !== "paid");
  const collected = campRegs.filter((item) => item.paidOn && (item.status === "registered" || item.status === "expired")).reduce((sum, item) => sum + item.amount, 0);
  const outstanding = awaiting.reduce((sum, item) => sum + item.amount, 0);

  const sessionState = (item: CampSession): SessionState =>
    item.status === "cancelled" ? "cancelled" : item.date < today ? "done" : item.date === today ? "today" : "upcoming";
  const campSessions = sortSessions(sessions.filter((item) => selected && item.campId === selected.id));
  const heldSessions = campSessions.filter((item) => item.status !== "cancelled");
  const cancelledCount = campSessions.length - heldSessions.length;
  const campSessionIds = new Set(heldSessions.map((item) => item.id));
  const campAttendance = attendance.filter((item) => campSessionIds.has(item.sessionId));
  const campRate = campAttendance.length ? Math.round((campAttendance.filter((item) => item.status === "present").length / campAttendance.length) * 100) : null;
  const doneCount = heldSessions.filter((item) => item.date < today).length;
  const upcomingCount = heldSessions.length - doneCount;
  const nextSession = heldSessions.find((item) => item.date >= today);

  const sessionsByDay = new Map<string, CampSession[]>();
  campSessions.forEach((item) => sessionsByDay.set(item.date, [...(sessionsByDay.get(item.date) ?? []), item]));
  const weeks = selected ? buildWeeks(selected) : [];
  const defaultDay = selected ? (today >= selected.startDate && today <= selected.endDate ? today : nextSession?.date ?? selected.startDate) : "";
  const activeDay = selected && selectedDay >= selected.startDate && selectedDay <= selected.endDate ? selectedDay : defaultDay;
  const daySessions = sessionsByDay.get(activeDay) ?? [];

  const daySummary = (day: string) => {
    const list = (sessionsByDay.get(day) ?? []).filter((item) => item.status !== "cancelled");
    if (list.length === 0 || day > today) return null;
    const ids = new Set(list.map((item) => item.id));
    const records = attendance.filter((item) => ids.has(item.sessionId));
    if (records.length === 0) return day < today ? { text: "Not recorded", tone: "none" } : null;
    const present = records.filter((item) => item.status === "present").length;
    const rate = Math.round((present / records.length) * 100);
    return { text: `${present}/${records.length} present`, tone: rate >= 75 ? "good" : rate >= 50 ? "mid" : "low" };
  };

  const rows = campRegs
    .filter((item) => filter === "all" || (filter === "registered" ? item.paymentStatus === "paid" : filter === "pending" ? item.paymentStatus === "unpaid" : filter === "expired" ? item.paymentStatus === "expired" : item.status === filter))
    .map((registration) => {
      const athlete = participantById.get(registration.participantId);
      const marks = campAttendance.filter((item) => item.participantId === registration.participantId);
      return {
        registration,
        athlete,
        view: registrationView(registration, selected, today),
        rate: marks.length ? Math.round((marks.filter((item) => item.status === "present").length / marks.length) * 100) : null,
      };
    })
    .filter((row) => row.athlete)
    .sort((a, b) => (statusOrder[a.registration.status] - statusOrder[b.registration.status]) || fullName(a.athlete!).localeCompare(fullName(b.athlete!)));

  const campStatus = selected
    ? selected.endDate < today ? "Completed" : enrolled >= selected.capacity ? "Full" : enrolled / selected.capacity >= 0.85 ? "Almost full" : "Open"
    : "";
  const chips: { value: StatusFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: campRegs.length },
    { value: "registered", label: "Paid", count: campRegs.filter((item) => item.paymentStatus === "paid").length },
    { value: "pending", label: "Not paid", count: campRegs.filter((item) => item.paymentStatus === "unpaid").length },
    { value: "waitlisted", label: "Waitlisted", count: countOf("waitlisted") },
    { value: "expired", label: "Expired", count: campRegs.filter((item) => item.paymentStatus === "expired").length },
  ];

  const rosterFor = (target: CampSession) => {
    const recorded = new Set(attendance.filter((item) => item.sessionId === target.id).map((item) => item.participantId));
    return participants
      .filter((athlete) => recorded.has(athlete.id) || regs.some((item) =>
        item.participantId === athlete.id && item.campId === target.campId &&
        (item.status === "registered" || (item.status === "expired" && Boolean(item.paidOn) && item.expiresOn >= target.date))))
      .sort((a, b) => a.lastName.localeCompare(b.lastName));
  };

  const attendanceSession = modal?.type === "attendance" ? sessions.find((item) => item.id === modal.sessionId) : undefined;
  const attendanceRoster = attendanceSession ? rosterFor(attendanceSession) : [];
  const cancelTarget = modal?.type === "cancel" ? sessions.find((item) => item.id === modal.sessionId) : undefined;
  const draftCount = (status: AttendanceStatus) => Object.values(attendanceDraft).filter((value) => value === status).length;
  const days = selected ? campDays(selected) : [];

  async function saveSessionForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || modal?.type !== "session") return;
    const { editing, reschedule } = modal;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const again = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "again";
    const values = {
      title: String(form.get("title")).trim(),
      date: String(form.get("date")),
      startTime: String(form.get("startTime")),
      endTime: String(form.get("endTime")),
    };

    const problem = validateSession(selected, values.date, values.startTime, values.endTime);
    if (problem) {
      setFormError(problem);
      return;
    }

    setSaving(true);
    setFormError("");
    if (editing) {
      if (liveClient) {
        const { error } = await liveClient.from("sessions").update({
          title: values.title, starts_at: toIso(values.date, values.startTime), ends_at: toIso(values.date, values.endTime),
          ...(reschedule ? { status: "scheduled", cancel_reason: null } : {}),
        }).eq("id", editing.id);
        if (error) {
          setFormError(`Could not update session: ${error.message}`);
          setSaving(false);
          return;
        }
      }
      setSessions((current) => current.map((item) => item.id === editing.id
        ? { ...item, ...values, ...(reschedule ? { status: "scheduled" as const, cancelReason: "" } : {}) }
        : item));
      setNotice(reschedule ? `Rescheduled “${values.title}” to ${formatLongDate(values.date)}.`
        : editing.date !== values.date ? `Moved “${values.title}” to ${formatLongDate(values.date)}.` : `Updated “${values.title}”.`);
    } else {
      const result = await insertSessions(liveClient, selected.id, [values]);
      if (result.error) {
        setFormError(`Could not add session: ${result.error}`);
        setSaving(false);
        return;
      }
      setSessions((current) => [...current, ...result.sessions]);
      setNotice(`Added “${values.title}” on ${formatLongDate(values.date)}.`);
    }
    setSelectedDay(values.date);
    setSaving(false);
    if (!editing && again) {
      formElement.reset();
      setModalNotice(`Added “${values.title}”. Add another session below.`);
      return;
    }
    closeModal();
  }

  async function deleteSelectedSessions() {
    if (!selected || !selectedSessions.length) return;
    const ids = campSessions.filter((item) => selectedSessions.includes(item.id)).map((item) => item.id);
    const marks = attendance.filter((item) => ids.includes(item.sessionId)).length;
    if (!ids.length || !window.confirm(`Permanently delete ${ids.length} session(s) and ${marks} associated attendance record(s)? This cannot be undone.`)) return;
    setSaving(true);
    setFormError("");
    if (liveClient) {
      const { data, error } = await liveClient.from("sessions").delete().eq("camp_id", selected.id).in("id", ids).select("id");
      if (error || !data || data.length !== ids.length) {
        setFormError(`Could not delete all sessions: ${error?.message ?? "Some sessions were not found. Reload and try again."}`);
        if (data?.length) {
          const deleted = new Set(data.map((item) => item.id));
          setSessions((current) => current.filter((item) => !deleted.has(item.id)));
          setAttendance((current) => current.filter((item) => !deleted.has(item.sessionId)));
          setSelectedSessions((current) => current.filter((id) => !deleted.has(id)));
        }
        setSaving(false);
        return;
      }
    }
    setSessions((current) => current.filter((item) => !ids.includes(item.id)));
    setAttendance((current) => current.filter((item) => !ids.includes(item.sessionId)));
    setSelectedSessions([]);
    setSaving(false);
    setNotice(`Deleted ${ids.length} session(s) and ${marks} attendance record(s).`);
    closeModal();
  }

  async function saveCampAthlete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const again = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "again";
    setSaving(true);
    setFormError("");
    setModalNotice("");
    let athlete: Participant | undefined;
    if (athleteMode === "new") {
      const values = {
        firstName: String(form.get("firstName") ?? "").trim(), lastName: String(form.get("lastName") ?? "").trim(),
        email: String(form.get("email") ?? "").trim(), phone: String(form.get("phone") ?? "").trim(),
        guardianName: String(form.get("guardianName") ?? "").trim(), guardianEmail: String(form.get("guardianEmail") ?? "").trim(),
      };
      if (!values.firstName || !values.lastName) { setFormError("First and last names are required."); setSaving(false); return; }
      let id = crypto.randomUUID();
      if (liveClient) {
        const { data, error } = await liveClient.from("participants").insert({
          first_name: values.firstName, last_name: values.lastName, email: values.email || null, phone: values.phone || null,
          guardian_name: values.guardianName || null, guardian_email: values.guardianEmail || null,
        }).select("id").single();
        if (error || !data) { setFormError(`Could not create athlete: ${error?.message ?? "No athlete was returned."}`); setSaving(false); return; }
        id = data.id;
      }
      athlete = { id, ...values, ...emptyHealth };
      setParticipants((current) => [...current, athlete!]);
    } else {
      athlete = participants.find((item) => item.id === String(form.get("participantId")));
      if (!athlete) { setFormError("Select an athlete."); setSaving(false); return; }
    }
    const previous = registrations.find((item) => item.campId === selected.id && item.participantId === athlete!.id);
    if (previous && previous.status !== "withdrawn") { setFormError("This athlete is already in the camp."); setSaving(false); return; }
    let status: Registration["status"];
    if (previous) {
      status = enrolled >= selected.capacity ? "waitlisted" : "registered";
      if (liveClient) {
        const { error } = await liveClient.from("camp_registrations").update({ status }).eq("id", previous.id);
        if (error) { setFormError(`Could not add athlete to camp: ${error.message}`); setSaving(false); return; }
      }
      setRegistrations((current) => current.map((item) => item.id === previous.id ? { ...item, status } : item));
    } else {
      const result = await createRegistration(liveClient, selected, enrolled, athlete.id);
      if (!result.registration) {
        setFormError(`${athleteMode === "new" ? "Athlete was created, but could not be added to the camp. Select the existing athlete to retry. " : ""}${result.error}`);
        if (athleteMode === "new") setAthleteMode("existing");
        setSaving(false);
        return;
      }
      status = result.registration.status;
      setRegistrations((current) => [...current, result.registration!]);
    }
    const message = `${fullName(athlete)} added to ${selected.name}${status === "waitlisted" ? " (waitlisted; camp is full)" : ""}.`;
    setSaving(false);
    if (again) { formElement.reset(); setModalNotice(message); return; }
    setNotice(message);
    closeModal();
  }

  async function saveCampProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (modal?.type !== "edit-athlete") return;
    const person = participants.find((item) => item.id === modal.participantId);
    if (!person) return;
    const form = new FormData(event.currentTarget);
    const values = {
      firstName: String(form.get("firstName") ?? "").trim(), lastName: String(form.get("lastName") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(), phone: String(form.get("phone") ?? "").trim(),
      guardianName: String(form.get("guardianName") ?? "").trim(), guardianEmail: String(form.get("guardianEmail") ?? "").trim(),
      dateOfBirth: String(form.get("dateOfBirth") ?? ""),
    };
    if (!values.firstName || !values.lastName) { setFormError("First and last names are required."); return; }
    setSaving(true); setFormError("");
    if (liveClient) {
      const { error } = await liveClient.from("participants").update({
        first_name: values.firstName, last_name: values.lastName, email: values.email || null, phone: values.phone || null,
        guardian_name: values.guardianName || null, guardian_email: values.guardianEmail || null, date_of_birth: values.dateOfBirth || null,
      }).eq("id", person.id);
      if (error) { setFormError(`Could not update athlete: ${error.message}`); setSaving(false); return; }
    }
    setParticipants((current) => current.map((item) => item.id === person.id ? { ...item, ...values } : item));
    setSaving(false); setNotice(`Updated ${values.firstName} ${values.lastName}.`); closeModal();
  }

  async function moveSession(target: CampSession, day: string) {
    if (!selected || target.date === day) return;
    const problem = validateSession(selected, day, target.startTime, target.endTime);
    if (problem) {
      setPageError(problem);
      return;
    }
    const rescheduling = target.status === "cancelled";
    if (attendance.some((item) => item.sessionId === target.id) &&
      !window.confirm(`“${target.title}” already has attendance recorded. Move it to ${formatLongDate(day)} anyway?`)) return;

    setPageError("");
    if (liveClient) {
      const { error } = await liveClient.from("sessions").update({
        starts_at: toIso(day, target.startTime), ends_at: toIso(day, target.endTime),
        ...(rescheduling ? { status: "scheduled", cancel_reason: null } : {}),
      }).eq("id", target.id);
      if (error) {
        setPageError(`Could not move session: ${error.message}`);
        return;
      }
    }
    setSessions((current) => current.map((item) => item.id === target.id
      ? { ...item, date: day, ...(rescheduling ? { status: "scheduled" as const, cancelReason: "" } : {}) }
      : item));
    setNotice(`${rescheduling ? "Rescheduled" : "Moved"} “${target.title}” to ${formatLongDate(day)}.`);
    setSelectedDay(day);
  }

  async function confirmCancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cancelTarget) return;
    const reason = cancelReason.trim();

    setSaving(true);
    setFormError("");
    if (liveClient) {
      if (attendance.some((item) => item.sessionId === cancelTarget.id)) {
        const cleared = await liveClient.from("attendance").delete().eq("session_id", cancelTarget.id);
        if (cleared.error) {
          setFormError(`Could not cancel session: ${cleared.error.message}`);
          setSaving(false);
          return;
        }
      }
      const { error } = await liveClient.from("sessions").update({ status: "cancelled", cancel_reason: reason || null }).eq("id", cancelTarget.id);
      if (error) {
        setFormError(`Could not cancel session: ${error.message}`);
        setSaving(false);
        return;
      }
    }
    setAttendance((current) => current.filter((item) => item.sessionId !== cancelTarget.id));
    setSessions((current) => current.map((item) => item.id === cancelTarget.id ? { ...item, status: "cancelled", cancelReason: reason } : item));
    setNotice(`Cancelled “${cancelTarget.title}”. Use Reschedule to put it on another day.`);
    setSaving(false);
    closeModal();
  }

  async function restoreSession(target: CampSession) {
    setPageError("");
    if (liveClient) {
      const { error } = await liveClient.from("sessions").update({ status: "scheduled", cancel_reason: null }).eq("id", target.id);
      if (error) {
        setPageError(`Could not restore session: ${error.message}`);
        return;
      }
    }
    setSessions((current) => current.map((item) => item.id === target.id ? { ...item, status: "scheduled", cancelReason: "" } : item));
    setNotice(`Restored “${target.title}” on ${formatLongDate(target.date)}.`);
  }

  async function saveMulti(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const values = {
      title: String(form.get("title")).trim(),
      startTime: String(form.get("startTime")),
      endTime: String(form.get("endTime")),
    };

    if (multiDays.length === 0) {
      setFormError("Select at least one day.");
      return;
    }
    for (const day of multiDays) {
      const problem = validateSession(selected, day, values.startTime, values.endTime);
      if (problem) {
        setFormError(problem);
        return;
      }
    }

    const source = modal?.type === "multi" ? modal.source : undefined;
    const existing = new Set(campSessions.map((item) =>
      `${item.date}|${item.startTime}${source ? `|${item.title.toLowerCase()}` : ""}`));
    const dates = [...multiDays].sort().filter((day) =>
      !existing.has(`${day}|${values.startTime}${source ? `|${values.title.toLowerCase()}` : ""}`));
    const skipped = multiDays.length - dates.length;
    if (dates.length === 0) {
      setFormError(`All ${skipped} selected days already have matching sessions at that time.`);
      return;
    }

    setSaving(true);
    setFormError("");
    const result = await insertSessions(liveClient, selected.id, dates.map((date) => ({ ...values, date })));
    if (result.error) {
      setFormError(`Could not add sessions: ${result.error}`);
      setSaving(false);
      return;
    }
    setSessions((current) => [...current, ...result.sessions]);
    setNotice(`Added ${dates.length} ${dates.length === 1 ? "session" : "sessions"}${skipped ? ` (skipped ${skipped} that already existed)` : ""}.`);
    setSaving(false);
    closeModal();
  }

  async function deleteSession(target: CampSession) {
    if (!window.confirm(`Delete “${target.title}” on ${formatDateYear(target.date)}? Its attendance records will also be removed.`)) return;
    setPageError("");
    setNotice("");
    if (liveClient) {
      const { error } = await liveClient.from("sessions").delete().eq("id", target.id);
      if (error) {
        setPageError(`Could not delete session: ${error.message}`);
        return;
      }
    }
    setSessions((current) => current.filter((item) => item.id !== target.id));
    setAttendance((current) => current.filter((item) => item.sessionId !== target.id));
    closeModal();
  }

  function openAttendance(target: CampSession) {
    const draft: Record<string, AttendanceStatus> = {};
    attendance.filter((item) => item.sessionId === target.id).forEach((item) => { draft[item.participantId] = item.status; });
    setAttendanceDraft(draft);
    openModal({ type: "attendance", sessionId: target.id });
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
    const failure = await saveAttendanceFor(liveClient, sessionId, entries, clearedIds);
    if (failure) {
      setFormError(`Could not save attendance: ${failure}`);
      setSaving(false);
      return;
    }
    setAttendance((current) => [
      ...current.filter((item) => item.sessionId !== sessionId),
      ...entries.map(([participantId, status]) => ({ sessionId, participantId, status })),
    ]);
    setNotice(`Saved attendance for “${attendanceSession.title}”.`);
    setSaving(false);
    closeModal();
  }

  function openMulti(source?: CampSession) {
    setMultiDays(source || !selected ? [] : defaultSessionDays(selected));
    openModal({ type: "multi", source });
  }

  function openCancel(target: CampSession) {
    setCancelReason("");
    openModal({ type: "cancel", sessionId: target.id });
  }

  function toggleDay(day: string) {
    setMultiDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day]);
  }

  const sessionModal = modal?.type === "session" ? modal : undefined;
  const editingSession = sessionModal?.editing;
  const multiSource = modal?.type === "multi" ? modal.source : undefined;
  const cancelHasAttendance = cancelTarget ? attendance.some((item) => item.sessionId === cancelTarget.id) : false;

  return (
    <AppShell active="camps" breadcrumb="Camps" campCount={camps.length} athleteCount={participants.length}>
      <div className="dashboard-content">
        <section className="welcome-row">
          <div>
            <div className="eyebrow"><span className="live-dot" />{client ? "CONNECTED · PRIVATE TO YOUR ACCOUNT" : "DEMO MODE · SAMPLE DATA"}</div>
            <h1>Camps</h1>
            <p>Choose a camp to see its athletes, payments and sessions.</p>
          </div>
          <Link className="secondary-button" href="/">Back to overview</Link>
        </section>

        {pageError && <p className="camp-alert" role="alert">{pageError}</p>}
        {notice && <p className="camp-alert camp-alert-info" role="status">{notice}</p>}
        {dataLoading && <p className="camp-alert camp-alert-info" role="status">Loading your data…</p>}

        <div className="athlete-layout">
          <aside className="panel athlete-list-panel" aria-label="Camps">
            <div className="athlete-list athlete-list-tall">
              {orderedCamps.length === 0 && <div className="empty-state">{dataLoading ? "Loading…" : "No camps yet. Create one on the overview page."}</div>}
              {orderedCamps.map((camp) => {
                const paid = regs.filter((item) => item.campId === camp.id && item.status === "registered").length;
                return (
                  <button className={`athlete-item camp-item ${selected?.id === camp.id ? "athlete-item-active" : ""}`} key={camp.id} onClick={() => selectCamp(camp.id)} type="button">
                    <span className="athlete-item-copy">
                      <strong>{camp.name}</strong>
                      <span>{formatDate(camp.startDate)} – {formatDate(camp.endDate)} · {paid}/{camp.capacity} active{camp.endDate < today ? " · ended" : ""}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="athlete-detail">
            {!selected ? (
              <div className="panel"><div className="empty-state">Create a camp on the overview page to see its athletes here.</div></div>
            ) : (
              <>
                <section className="panel athlete-header">
                  <div className="athlete-header-copy">
                    <h2>{selected.name} <span className={`status-pill status-${campStatus.toLowerCase().replace(" ", "-")}`}><span />{campStatus}</span></h2>
                    <p className="camp-header-meta">
                      <span><CalendarDays size={13} />{formatDateYear(selected.startDate)} – {formatDateYear(selected.endDate)}</span>
                      <span><MapPin size={13} />{selected.location}</span>
                      <span><Tag size={13} />{selected.price > 0 ? `${formatMoney(selected.price)} per athlete` : "Free"}</span>
                      <span><Users size={13} />{selected.ageGroup}</span>
                    </p>
                  </div>
                  <Link className="secondary-button" href={`/participants?camp=${selected.id}`}>Open in athlete records</Link>
                </section>

                <section className="panel detail-panel">
                  <div className="camp-form">
                    <label>Next monthly camp
                      <select value={selected.nextCampId ?? ""} disabled={saving || Boolean(selected.rolledOverAt)} onChange={(event) => setSuccessor(selected, event.target.value)}>
                        <option value="">No automatic rollover</option>
                        {camps.filter((camp) => camp.id !== selected.id && camp.startDate > selected.endDate)
                          .map((camp) => <option key={camp.id} value={camp.id}>{camp.name} ({camp.startDate} – {camp.endDate})</option>)}
                      </select>
                    </label>
                    <p className="field-hint">{selected.rolledOverAt ? "Rollover has already run; the link is locked." : "After this camp ends, active athletes move to the linked camp as unpaid; overflow is waitlisted. Existing registrations and history are retained. Background scheduling must be configured in Supabase."}</p>
                  </div>
                </section>

                <section className="stats-grid" aria-label="Camp summary">
                  <article className="stat-card">
                    <div className="stat-top"><span>Active places</span><span className="stat-icon stat-icon-mint"><Users size={17} /></span></div>
                    <div className="stat-value">{enrolled}<span className="stat-unit">/ {selected.capacity}</span></div>
                    <p className="stat-foot">{countOf("waitlisted")} waitlisted</p>
                  </article>
                  <article className="stat-card">
                    <div className="stat-top"><span>Awaiting payment</span><span className="stat-icon stat-icon-yellow"><Tag size={17} /></span></div>
                    <div className="stat-value">{awaiting.length}</div>
                    <p className="stat-foot">{outstanding > 0 ? `${formatMoney(outstanding)} outstanding` : "Nothing outstanding"}</p>
                  </article>
                  <article className="stat-card">
                    <div className="stat-top"><span>Collected</span><span className="stat-icon stat-icon-lavender"><Tag size={17} /></span></div>
                    <div className="stat-value stat-value-small">{formatMoney(collected)}</div>
                    <p className="stat-foot">{campRegs.filter((item) => item.paymentStatus === "expired").length} payments expired</p>
                  </article>
                  <article className="stat-card">
                    <div className="stat-top"><span>Attendance</span><span className="stat-icon stat-icon-peach"><Activity size={17} /></span></div>
                    <div className="stat-value">{campRate === null ? "—" : <>{campRate}<span className="stat-unit">%</span></>}</div>
                    <p className="stat-foot">{doneCount} done · {upcomingCount} upcoming{cancelledCount > 0 ? ` · ${cancelledCount} cancelled` : ""}</p>
                  </article>
                </section>

                <section className="panel detail-panel" id="sessions">
                  <div className="panel-heading">
                    <div><h2>Session calendar</h2><p>Click a day for details. Drag a session onto another day to move it. Days outside {formatDate(selected.startDate)} – {formatDate(selected.endDate)} are not available.</p></div>
                    <div className="panel-actions">
                      <button className="secondary-button small-button" type="button" onClick={() => { setSelectedSessions([]); openModal({ type: "manage-sessions" }); }}>Manage sessions</button>
                      <button className="secondary-button small-button" type="button" onClick={() => openMulti()}><Copy size={14} />Several days</button>
                      <button className="primary-button small-button" type="button" onClick={() => openModal({ type: "session", date: activeDay })}><Plus size={14} />Add session</button>
                    </div>
                  </div>
                  <SessionImport key={selected.id} camp={selected} sessions={campSessions} client={liveClient} onImported={(items) => setSessions((current) => [...current, ...items])} />
                  {nextSession && (
                    <div className="next-callout">
                      <Clock3 size={16} />
                      <div><strong>Next: {nextSession.title}</strong><span>{formatLongDate(nextSession.date)} · {formatTime(nextSession.startTime).time} {formatTime(nextSession.startTime).period} – {formatTime(nextSession.endTime).time} {formatTime(nextSession.endTime).period}</span></div>
                      <button className="row-edit" type="button" onClick={() => openAttendance(nextSession)}>Take attendance</button>
                    </div>
                  )}

                  <div className="calendar" role="grid" aria-label={`${selected.name} calendar`}>
                    <div className="cal-grid cal-head" role="row">{weekdayHeads.map((name) => <span key={name} role="columnheader">{name}</span>)}</div>
                    {weeks.map((week) => (
                      <div className="cal-grid" role="row" key={week[0]}>
                        {week.map((day) => {
                          const inCamp = day >= selected.startDate && day <= selected.endDate;
                          const list = sessionsByDay.get(day) ?? [];
                          const summary = inCamp ? daySummary(day) : null;
                          const label = day === selected.startDate || day.endsWith("-01") ? formatDate(day) : String(Number(day.slice(8)));
                          return (
                            <div
                              aria-disabled={!inCamp}
                              aria-selected={inCamp ? activeDay === day : undefined}
                              aria-label={inCamp ? `${formatLongDate(day)}, ${list.length} ${list.length === 1 ? "session" : "sessions"}` : undefined}
                              className={`cal-day ${inCamp ? "" : "cal-day-out"} ${inCamp && activeDay === day ? "cal-day-selected" : ""} ${day === today ? "cal-day-today" : ""} ${dragOverDay === day ? "cal-day-drop" : ""}`}
                              key={day}
                              onClick={() => { if (inCamp) setSelectedDay(day); }}
                              onDragLeave={() => setDragOverDay((current) => current === day ? "" : current)}
                              onDragOver={(event) => { if (inCamp && dragId) { event.preventDefault(); setDragOverDay(day); } }}
                              onDrop={(event) => {
                                event.preventDefault();
                                const target = sessions.find((item) => item.id === dragId);
                                setDragOverDay("");
                                setDragId("");
                                if (target && inCamp) moveSession(target, day);
                              }}
                              onKeyDown={(event) => { if (inCamp && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setSelectedDay(day); } }}
                              role="gridcell"
                              tabIndex={inCamp ? 0 : -1}
                            >
                              <span className="cal-date">{label}</span>
                              {list.slice(0, 2).map((item) => (
                                <div
                                  className={`cal-chip cal-chip-${sessionState(item)} ${dragId === item.id ? "cal-chip-dragging" : ""}`}
                                  draggable={inCamp}
                                  key={item.id}
                                  onDragEnd={() => { setDragId(""); setDragOverDay(""); }}
                                  onDragStart={(event) => { setDragId(item.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); }}
                                  title={`${item.startTime} ${item.title}${item.status === "cancelled" ? ` (cancelled${item.cancelReason ? `: ${item.cancelReason}` : ""})` : ""}`}
                                >{item.startTime} {item.title}</div>
                              ))}
                              {list.length > 2 && <span className="cal-more">+{list.length - 2} more</span>}
                              {summary && <span className={`cal-summary cal-summary-${summary.tone}`}>{summary.text}</span>}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <div className="cal-legend" aria-hidden="true">
                    <span><i className="cal-dot cal-chip-upcoming" />Upcoming</span>
                    <span><i className="cal-dot cal-chip-today" />Today</span>
                    <span><i className="cal-dot cal-chip-done" />Done</span>
                    <span><i className="cal-dot cal-chip-cancelled" />Cancelled</span>
                    <span className="cal-legend-note">On touch screens, use Edit to change a session&apos;s date.</span>
                  </div>

                  <div className="day-panel">
                    <div className="day-panel-head">
                      <div><h3>{formatLongDate(activeDay)}</h3><p>{daySessions.length === 0 ? "No sessions on this day" : `${daySessions.length} ${daySessions.length === 1 ? "session" : "sessions"}`}</p></div>
                      <button className="secondary-button small-button" type="button" onClick={() => openModal({ type: "session", date: activeDay })}><Plus size={14} />Add session on this day</button>
                    </div>
                    {daySessions.length === 0 && <div className="empty-state">Nothing scheduled. Add a session, or drag one here from another day.</div>}
                    {daySessions.map((item) => {
                      const start = formatTime(item.startTime);
                      const end = formatTime(item.endTime);
                      const state = sessionState(item);
                      const records = attendance.filter((record) => record.sessionId === item.id);
                      const roster = rosterFor(item);
                      const recordedIds = new Set(records.map((record) => record.participantId));
                      const missing = roster.filter((athlete) => !recordedIds.has(athlete.id)).map((athlete) => fullName(athlete));
                      return (
                        <article className={`day-session day-session-${state}`} key={item.id}>
                          <div className="day-session-head">
                            <div>
                              <strong>{item.title}</strong>
                              <span>{start.time} {start.period} – {end.time} {end.period}</span>
                            </div>
                            <span className={`sess-badge sess-${state}`}>{stateLabels[state]}</span>
                          </div>
                          {state === "cancelled" ? (
                            <p className="cancel-note"><Ban size={13} />Cancelled{item.cancelReason ? `: ${item.cancelReason}` : ""}. Reschedule it to another day when you are ready.</p>
                          ) : records.length === 0 ? (
                            <p className="cell-sub">No attendance recorded yet · {roster.length} expected</p>
                          ) : (
                            <div className="session-detail">
                              {attendanceOptions.map((option) => {
                                const names = records.filter((record) => record.status === option.value).map((record) => participantById.get(record.participantId)).filter(Boolean).map((athlete) => fullName(athlete!));
                                return <div className="detail-line" key={option.value}><span className={`attend-badge attend-${option.value}`}>{option.label} {names.length}</span><span>{names.join(", ") || "—"}</span></div>;
                              })}
                              {missing.length > 0 && <div className="detail-line"><span className="attend-badge attend-unmarked">Not marked {missing.length}</span><span>{missing.join(", ")}</span></div>}
                            </div>
                          )}
                          <div className="row-actions day-session-actions">
                            {state !== "cancelled" && <button className="row-edit" type="button" onClick={() => openAttendance(item)}><Check size={12} />Attendance</button>}
                            {state === "cancelled" && <button className="row-edit" type="button" onClick={() => openModal({ type: "session", editing: item, reschedule: true })}><CalendarDays size={12} />Reschedule</button>}
                            {state === "cancelled" && <button className="row-edit" type="button" onClick={() => restoreSession(item)}><RotateCcw size={12} />Restore</button>}
                            {state !== "cancelled" && <button className="row-edit" type="button" onClick={() => openModal({ type: "session", editing: item })}>Edit</button>}
                            {state !== "cancelled" && <button className="row-edit" type="button" onClick={() => openMulti(item)}>Duplicate</button>}
                            {state !== "cancelled" && <button className="row-delete" type="button" onClick={() => openCancel(item)}>Cancel session</button>}
                            <button className="row-delete" type="button" aria-label={`Delete ${item.title} on ${formatDate(item.date)}`} onClick={() => deleteSession(item)}>Delete</button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>

                <section className="panel detail-panel">
                  <div className="panel-heading">
                    <div><h2>Athletes in this camp</h2><p>Select an athlete to open their full record.</p></div>
                    <button className="primary-button small-button" type="button" onClick={() => { setAthleteMode("new"); openModal({ type: "add-athlete" }); }}><Plus size={14} />Add athlete</button>
                  </div>
                  <div className="chip-row" role="group" aria-label="Filter by status">
                    {chips.map((chip) => (
                      <button aria-pressed={filter === chip.value} className={`chip ${filter === chip.value ? "chip-active" : ""}`} key={chip.value} onClick={() => setFilter(chip.value)} type="button">{chip.label}<span>{chip.count}</span></button>
                    ))}
                  </div>
                  {rows.length === 0 ? (
                    <div className="empty-state">{campRegs.length === 0 ? "No athletes are registered for this camp yet." : "No athletes match this status."}</div>
                  ) : (
                    <div className="participant-table-wrap">
                      <table className="participant-table payments-table">
                        <thead><tr><th>ATHLETE</th><th>PAYMENT</th><th>ATTENDANCE</th><th><span className="sr-only">Actions</span></th></tr></thead>
                        <tbody>{rows.map(({ registration, athlete, view, rate }) => (
                          <tr key={registration.id}>
                            <td><div className="athlete-cell"><span className={`athlete-avatar ${avatarFor(fullName(athlete!))}`}>{initialsOf(athlete!)}</span><strong>{fullName(athlete!)}</strong></div></td>
                            <td><span className={`pay-badge ${view.cls}`}>{view.label}</span><span className="cell-sub">{view.detail}</span></td>
                            <td>{rate === null ? "—" : <span className="attendance-cell"><span className="mini-progress"><span style={{ width: `${rate}%` }} /></span>{rate}%</span>}</td>
                            <td><div className="row-actions"><button className="row-edit" type="button" onClick={() => openModal({ type: "edit-athlete", participantId: athlete!.id })}>Edit</button><Link className="row-edit" href={`/participants?id=${athlete!.id}&camp=${selected.id}`}>View record</Link></div></td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </div>

      {modal?.type === "session" && selected && (
        <div className="modal-backdrop" onMouseDown={backdropClose}>
          <section aria-labelledby="session-form-title" aria-modal="true" className="camp-modal" role="dialog">
            <div className="modal-heading"><div><span className="modal-icon"><Clock3 size={18} /></span><h2 id="session-form-title">{sessionModal?.reschedule ? "Reschedule session" : editingSession ? "Edit session" : "Add a session"}</h2><p>{selected.name} · {formatDate(selected.startDate)} – {formatDate(selected.endDate)}</p></div><button className="icon-button" aria-label="Close dialog" onClick={closeModal} type="button"><X size={19} /></button></div>
            <form className="camp-form" onSubmit={saveSessionForm}>
              <label>Session title<input autoFocus defaultValue={editingSession?.title} name="title" placeholder="e.g. Ball control & footwork" required maxLength={120} /></label>
              <label>Date<input defaultValue={editingSession?.date ?? sessionModal?.date ?? ""} min={selected.startDate} max={selected.endDate} name="date" type="date" required /></label>
              {sessionModal?.reschedule
                ? <p className="field-hint">Pick the new day. The session becomes scheduled again and the cancellation note is cleared.</p>
                : editingSession && <p className="field-hint">Change the date to move this session. Attendance already recorded stays with the session.</p>}
              <div className="form-row"><label>Start time<input defaultValue={editingSession?.startTime} name="startTime" type="time" required /></label><label>End time<input defaultValue={editingSession?.endTime} name="endTime" type="time" required /></label></div>
              {formError && <p className="camp-alert" role="alert">{formError}</p>}
              {modalNotice && <p className="camp-alert camp-alert-info" role="status">{modalNotice}</p>}
              <div className="modal-actions"><button className="secondary-button" onClick={closeModal} type="button">Cancel</button>{!editingSession && <button className="secondary-button" disabled={saving} type="submit" value="again">Save and add another</button>}<button className="primary-button" disabled={saving} type="submit">{saving ? "Saving…" : sessionModal?.reschedule ? "Reschedule" : editingSession ? "Save changes" : <><Plus size={17} />Add session</>}</button></div>
              <p className="demo-note">{client ? "Saved to your private Supabase account." : "Demo only: changes are not saved after a refresh."}</p>
            </form>
          </section>
        </div>
      )}

      {modal?.type === "manage-sessions" && selected && (
        <div className="modal-backdrop" onMouseDown={backdropClose}>
          <section aria-labelledby="manage-sessions-title" aria-modal="true" className="camp-modal" role="dialog">
            <div className="modal-heading"><div><h2 id="manage-sessions-title">Manage sessions</h2><p>{selected.name} · Select sessions to delete permanently.</p></div><button className="icon-button" aria-label="Close dialog" onClick={closeModal} type="button"><X size={19} /></button></div>
            <div className="camp-form">
              <div className="panel-actions"><button className="secondary-button" type="button" onClick={() => setSelectedSessions(campSessions.map((item) => item.id))}>Select all</button><button className="secondary-button" type="button" onClick={() => setSelectedSessions([])}>Clear selection</button></div>
              {campSessions.length === 0 && <p>No sessions in this camp.</p>}
              <div className="session-select-list">{campSessions.map((item) => <label className="session-select-item" key={item.id}><input type="checkbox" checked={selectedSessions.includes(item.id)} onChange={(event) => { const checked = event.target.checked; setSelectedSessions((current) => checked ? [...current, item.id] : current.filter((id) => id !== item.id)); }} /> <span>{formatDateYear(item.date)} · {item.startTime} · {item.title}{item.status === "cancelled" ? " (cancelled)" : ""}</span></label>)}</div>
              <p>{selectedSessions.length} selected · {attendance.filter((item) => selectedSessions.includes(item.sessionId)).length} attendance records will be deleted.</p>
              {formError && <p className="camp-alert" role="alert">{formError}</p>}
              <div className="modal-actions"><button className="secondary-button" type="button" onClick={closeModal}>Close</button><button className="primary-button primary-button-warn" type="button" disabled={saving || !selectedSessions.length} onClick={deleteSelectedSessions}>{saving ? "Deleting…" : "Delete selected"}</button></div>
            </div>
          </section>
        </div>
      )}

      {modal?.type === "add-athlete" && selected && (
        <div className="modal-backdrop" onMouseDown={backdropClose}>
          <section aria-labelledby="add-camp-athlete-title" aria-modal="true" className="camp-modal" role="dialog">
            <div className="modal-heading"><div><h2 id="add-camp-athlete-title">Add athlete</h2><p>{selected.name} · {enrolled}/{selected.capacity} active places</p></div><button className="icon-button" aria-label="Close dialog" onClick={closeModal} type="button"><X size={19} /></button></div>
            <form className="camp-form" onSubmit={saveCampAthlete}>
              <label>Athlete<select value={athleteMode} disabled={saving} onChange={(event) => { setAthleteMode(event.target.value === "existing" ? "existing" : "new"); setFormError(""); }}><option value="new">Create new athlete</option><option value="existing">Choose existing athlete</option></select></label>
              {athleteMode === "existing" ? <label>Existing athlete<select name="participantId" required defaultValue=""><option value="">Select an athlete</option>{participants.filter((person) => !registrations.some((item) => item.campId === selected.id && item.participantId === person.id && item.status !== "withdrawn")).sort((a, b) => fullName(a).localeCompare(fullName(b))).map((person) => <option key={person.id} value={person.id}>{fullName(person)}</option>)}</select></label> : <>
                <div className="form-row"><label>First name<input name="firstName" required maxLength={80} /></label><label>Last name<input name="lastName" required maxLength={80} /></label></div>
                <div className="form-row"><label>Email<input name="email" type="email" /></label><label>Phone<input name="phone" type="tel" /></label></div>
                <div className="form-row"><label>Guardian name<input name="guardianName" /></label><label>Guardian email<input name="guardianEmail" type="email" /></label></div>
              </>}
              <p className="field-hint">If the camp is full, the athlete will be waitlisted. Existing withdrawn registrations retain payment and attendance history.</p>
              {formError && <p className="camp-alert" role="alert">{formError}</p>}{modalNotice && <p className="camp-alert camp-alert-info" role="status">{modalNotice}</p>}
              <div className="modal-actions"><button className="secondary-button" type="button" onClick={closeModal}>Cancel</button><button className="secondary-button" type="submit" value="again" disabled={saving}>Save and add another</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Add athlete"}</button></div>
            </form>
          </section>
        </div>
      )}

      {modal?.type === "edit-athlete" && (() => {
        const athlete = participants.find((item) => item.id === modal.participantId);
        if (!athlete) return null;
        return <div className="modal-backdrop" onMouseDown={backdropClose}>
          <section aria-labelledby="edit-camp-athlete-title" aria-modal="true" className="camp-modal" role="dialog">
            <div className="modal-heading"><div><h2 id="edit-camp-athlete-title">Edit athlete details</h2><p>{fullName(athlete)}</p></div><button className="icon-button" aria-label="Close dialog" onClick={closeModal} type="button"><X size={19} /></button></div>
            <form className="camp-form" onSubmit={saveCampProfile}>
              <div className="form-row"><label>First name<input name="firstName" defaultValue={athlete.firstName} required maxLength={80} /></label><label>Last name<input name="lastName" defaultValue={athlete.lastName} required maxLength={80} /></label></div>
              <label>Date of birth<input name="dateOfBirth" type="date" defaultValue={athlete.dateOfBirth} /></label>
              <div className="form-row"><label>Email<input name="email" type="email" defaultValue={athlete.email} /></label><label>Phone<input name="phone" type="tel" defaultValue={athlete.phone} /></label></div>
              <div className="form-row"><label>Guardian name<input name="guardianName" defaultValue={athlete.guardianName} /></label><label>Guardian email<input name="guardianEmail" type="email" defaultValue={athlete.guardianEmail} /></label></div>
              {formError && <p className="camp-alert" role="alert">{formError}</p>}
              <div className="modal-actions"><button className="secondary-button" type="button" onClick={closeModal}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button></div>
            </form>
          </section>
        </div>;
      })()}

      {modal?.type === "cancel" && cancelTarget && (
        <div className="modal-backdrop" onMouseDown={backdropClose}>
          <section aria-labelledby="cancel-title" aria-modal="true" className="camp-modal" role="dialog">
            <div className="modal-heading"><div><span className="modal-icon modal-icon-warn"><Ban size={18} /></span><h2 id="cancel-title">Cancel session</h2><p>{cancelTarget.title} · {formatLongDate(cancelTarget.date)}</p></div><button className="icon-button" aria-label="Close dialog" onClick={closeModal} type="button"><X size={19} /></button></div>
            <form className="camp-form" onSubmit={confirmCancel}>
              <label>Reason (optional)<input autoFocus maxLength={200} onChange={(event) => setCancelReason(event.target.value)} placeholder="e.g. Heavy rain" value={cancelReason} /></label>
              <div className="chip-row">
                {reasonSuggestions.map((reason) => <button className="chip" key={reason} onClick={() => setCancelReason(reason)} type="button">{reason}</button>)}
              </div>
              <p className="field-hint">The session stays on the calendar marked as cancelled, so you can reschedule it later. {cancelHasAttendance ? "Attendance already recorded for it will be removed." : ""}</p>
              {formError && <p className="camp-alert" role="alert">{formError}</p>}
              <div className="modal-actions"><button className="secondary-button" onClick={closeModal} type="button">Keep session</button><button className="primary-button primary-button-warn" disabled={saving} type="submit">{saving ? "Saving…" : "Cancel session"}</button></div>
            </form>
          </section>
        </div>
      )}

      {modal?.type === "multi" && selected && (
        <div className="modal-backdrop" onMouseDown={backdropClose}>
          <section aria-labelledby="multi-title" aria-modal="true" className="camp-modal" role="dialog">
            <div className="modal-heading"><div><span className="modal-icon"><Copy size={18} /></span><h2 id="multi-title">{multiSource ? "Duplicate session" : "Add sessions on several days"}</h2><p>{multiSource ? `Copy “${multiSource.title}” to other days of ${selected.name}.` : `Schedule the same session on days of ${selected.name}.`}</p></div><button className="icon-button" aria-label="Close dialog" onClick={closeModal} type="button"><X size={19} /></button></div>
            <form className="camp-form" onSubmit={saveMulti}>
              <label>Session title<input autoFocus defaultValue={multiSource?.title} name="title" placeholder="e.g. Morning training" required maxLength={120} /></label>
              <div className="form-row"><label>Start time<input defaultValue={multiSource?.startTime ?? "20:00"} name="startTime" type="time" required /></label><label>End time<input defaultValue={multiSource?.endTime ?? "21:00"} name="endTime" type="time" required /></label></div>
              <div>
                <div className="day-picker-head">
                  <span>Select weekdays</span>
                  <span className="day-picker-tools">
                    {weekdayHeads.map((weekday, index) => (
                      <button className="text-link" type="button" key={weekday} onClick={() => {
                        const weekdayDays = days.filter((day) => (new Date(`${day}T12:00:00`).getDay() + 6) % 7 === index);
                        setMultiDays((current) => weekdayDays.every((day) => current.includes(day))
                          ? current.filter((day) => !weekdayDays.includes(day))
                          : [...new Set([...current, ...weekdayDays])]);
                      }}>{weekday}</button>
                    ))}
                  </span>
                </div>
                <div className="day-picker-head">
                  <span>Days ({multiDays.length} selected)</span>
                  <span className="day-picker-tools">
                    <button className="text-link" type="button" onClick={() => setMultiDays(days)}>Select whole camp</button>
                    <button className="text-link" type="button" onClick={() => setMultiDays([])}>Clear</button>
                  </span>
                </div>
                <div className="day-picker" role="group" aria-label="Camp days">
                  {days.map((day) => (
                    <label className={`day-option ${multiDays.includes(day) ? "day-option-on" : ""}`} key={day}>
                      <input checked={multiDays.includes(day)} onChange={() => toggleDay(day)} type="checkbox" />
                      <span>{weekdayLabel(day)}</span><strong>{formatDate(day)}</strong>
                      {multiSource?.date === day && <em>original</em>}
                    </label>
                  ))}
                </div>
                <p className="field-hint">{multiSource ? "Days that already have this session at the same time" : "Days that already have a session at the same start time"} are skipped. Attendance is not copied.</p>
              </div>
              {formError && <p className="camp-alert" role="alert">{formError}</p>}
              <div className="modal-actions"><button className="secondary-button" onClick={closeModal} type="button">Cancel</button><button className="primary-button" disabled={saving} type="submit">{saving ? "Saving…" : <><Plus size={17} />{multiSource ? "Duplicate" : "Add sessions"}</>}</button></div>
              <p className="demo-note">{client ? "Saved to your private Supabase account." : "Demo only: changes are not saved after a refresh."}</p>
            </form>
          </section>
        </div>
      )}

      {modal?.type === "attendance" && attendanceSession && (
        <div className="modal-backdrop" onMouseDown={backdropClose}>
          <section aria-labelledby="attendance-title" aria-modal="true" className="camp-modal attendance-modal" role="dialog">
            <div className="modal-heading"><div><span className="modal-icon"><Check size={18} /></span><h2 id="attendance-title">{attendanceSession.title}</h2><p>{formatLongDate(attendanceSession.date)} · {formatTime(attendanceSession.startTime).time} {formatTime(attendanceSession.startTime).period} – {formatTime(attendanceSession.endTime).time} {formatTime(attendanceSession.endTime).period}</p></div><button className="icon-button" aria-label="Close dialog" onClick={closeModal} type="button"><X size={19} /></button></div>
            {attendanceRoster.length === 0 ? (
              <div className="empty-state">No active athletes are registered in this camp yet.</div>
            ) : (
              <>
                <div className="attendance-tools attendance-tools-wide">
                  <span className="attendance-counts">{draftCount("present")} present · {draftCount("absent")} absent · {draftCount("excused")} excused · {attendanceRoster.length - Object.keys(attendanceDraft).length} not marked</span>
                  <span className="attendance-tools-actions">
                    <button className="text-link" type="button" onClick={() => setAttendanceDraft(Object.fromEntries(attendanceRoster.map((athlete) => [athlete.id, "present" as AttendanceStatus])))}>Mark all present</button>
                    <button className="text-link" type="button" onClick={() => setAttendanceDraft({})}>Clear all</button>
                  </span>
                </div>
                <div className="attendance-list">
                  {attendanceRoster.map((athlete) => (
                    <div className="attendance-row" key={athlete.id}>
                      <div className="athlete-cell"><span className={`athlete-avatar ${avatarFor(fullName(athlete))}`}>{initialsOf(athlete)}</span><strong>{fullName(athlete)}</strong></div>
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
    </AppShell>
  );
}

export default function CampsPage() {
  return (
    <Suspense fallback={null}>
      <CampRoster />
    </Suspense>
  );
}
