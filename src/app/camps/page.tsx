"use client";

import { Suspense, useEffect, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSupabase } from "@/lib/supabase-context";
import { AppShell } from "@/components/app-shell";
import { Activity, Ban, CalendarDays, Check, Clock3, Copy, MapPin, Plus, RotateCcw, Tag, Users, X } from "lucide-react";
import {
  addDays,
  avatarFor,
  campDays,
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
  for (let weekStart = startOfWeek(camp.startDate); weekStart <= last && weeks.length < 20; weekStart = addDays(weekStart, 7)) {
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
      if (event.key === "Escape") {
        setModal(null);
        setFormError("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal]);

  function closeModal() {
    setModal(null);
    setFormError("");
  }

  function openModal(next: NonNullable<Modal>) {
    setFormError("");
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
  const awaiting = campRegs.filter((item) => item.status === "pending");
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
    .filter((item) => filter === "all" || item.status === filter)
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
    { value: "registered", label: "Paid", count: enrolled },
    { value: "pending", label: "Not paid", count: awaiting.length },
    { value: "waitlisted", label: "Waitlisted", count: countOf("waitlisted") },
    { value: "expired", label: "Expired / completed", count: countOf("expired") },
  ];

  // Everyone who should be on a session's attendance sheet: paid athletes plus anyone already recorded.
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
    const form = new FormData(event.currentTarget);
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
    closeModal();
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

    const existing = new Set(campSessions.map((item) => `${item.date}|${item.startTime}|${item.title.toLowerCase()}`));
    const dates = [...multiDays].sort().filter((day) => !existing.has(`${day}|${values.startTime}|${values.title.toLowerCase()}`));
    const skipped = multiDays.length - dates.length;
    if (dates.length === 0) {
      setFormError("Every selected day already has this session at the same time.");
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
    setMultiDays(source ? [] : days);
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
                      <span>{formatDate(camp.startDate)} – {formatDate(camp.endDate)} · {paid}/{camp.capacity} paid{camp.endDate < today ? " · ended" : ""}</span>
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

                <section className="stats-grid" aria-label="Camp summary">
                  <article className="stat-card">
                    <div className="stat-top"><span>Paid places</span><span className="stat-icon stat-icon-mint"><Users size={17} /></span></div>
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
                    <p className="stat-foot">{countOf("expired")} expired / completed</p>
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
                      <button className="secondary-button small-button" type="button" onClick={() => openMulti()}><Copy size={14} />Several days</button>
                      <button className="primary-button small-button" type="button" onClick={() => openModal({ type: "session", date: activeDay })}><Plus size={14} />Add session</button>
                    </div>
                  </div>
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
                            <td><div className="row-actions"><Link className="row-edit" href={`/participants?id=${athlete!.id}&camp=${selected.id}`}>View record</Link></div></td>
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
              <div className="modal-actions"><button className="secondary-button" onClick={closeModal} type="button">Cancel</button><button className="primary-button" disabled={saving} type="submit">{saving ? "Saving…" : sessionModal?.reschedule ? "Reschedule" : editingSession ? "Save changes" : <><Plus size={17} />Add session</>}</button></div>
              <p className="demo-note">{client ? "Saved to your private Supabase account." : "Demo only: changes are not saved after a refresh."}</p>
            </form>
          </section>
        </div>
      )}

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
              <div className="form-row"><label>Start time<input defaultValue={multiSource?.startTime} name="startTime" type="time" required /></label><label>End time<input defaultValue={multiSource?.endTime} name="endTime" type="time" required /></label></div>
              <div>
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
                <p className="field-hint">Days that already have this session at the same time are skipped. Attendance is not copied.</p>
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
              <div className="empty-state">No paid athletes are registered in this camp yet. Record a payment on an athlete&apos;s record to confirm their place.</div>
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
