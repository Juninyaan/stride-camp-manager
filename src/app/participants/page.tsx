"use client";

import { Suspense, useEffect, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSupabase } from "@/lib/supabase-context";
import { AppShell } from "@/components/app-shell";
import { Activity, ArrowRight, CalendarDays, Check, HeartPulse, Plus, Search, Tag, UserPlus, X } from "lucide-react";
import {
  addDays,
  ageFrom,
  avatarFor,
  bloodTypes,
  createRegistration,
  formatDate,
  formatDateYear,
  formatMoney,
  fullName,
  initialsOf,
  loadCampData,
  localDate,
  paymentMethods,
  regularity,
  seedData,
  withExpiry,
  type AttendanceRecord,
  type Camp,
  type CampSession,
  type Participant,
  type Registration,
  type VitalRecord,
} from "@/lib/camp-model";

type Modal =
  | { type: "profile" }
  | { type: "medical" }
  | { type: "vital" }
  | { type: "payment"; registrationId: string }
  | null;

const optionalNumber = (value: FormDataEntryValue | null) => {
  const text = String(value ?? "").trim();
  return text ? Number(text) : null;
};

function AthleteRecords() {
  const { client, session } = useSupabase();
  const liveClient = client && session ? client : null;
  const searchParams = useSearchParams();

  const [camps, setCamps] = useState<Camp[]>(() => (client ? [] : seedData().camps));
  const [participants, setParticipants] = useState<Participant[]>(() => (client ? [] : seedData().participants));
  const [registrations, setRegistrations] = useState<Registration[]>(() => (client ? [] : seedData().registrations));
  const [sessions, setSessions] = useState<CampSession[]>(() => (client ? [] : seedData().sessions));
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() => (client ? [] : seedData().attendance));
  const [vitals, setVitals] = useState<VitalRecord[]>(() => (client ? [] : seedData().vitals));

  const [dataLoading, setDataLoading] = useState(Boolean(client));
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [formError, setFormError] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [selectedId, setSelectedId] = useState(searchParams.get("id") ?? "");
  const [query, setQuery] = useState("");
  const [showAllHistory, setShowAllHistory] = useState(false);

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
        setVitals(data.vitals);
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
    setModal(next);
  }

  function backdropClose(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) closeModal();
  }

  function selectAthlete(id: string) {
    setSelectedId(id);
    setShowAllHistory(false);
    window.history.replaceState(null, "", `/participants?id=${id}`);
  }

  const today = localDate();
  const regs = registrations.map((registration) => withExpiry(registration, today));
  const campById = new Map(camps.map((camp) => [camp.id, camp]));
  const sessionById = new Map(sessions.map((item) => [item.id, item]));
  const enrolledByCamp = new Map<string, number>();
  regs.forEach((item) => {
    if (item.status === "registered") enrolledByCamp.set(item.campId, (enrolledByCamp.get(item.campId) ?? 0) + 1);
  });

  const statusOf = (participantId: string) => {
    const own = regs.filter((item) => item.participantId === participantId);
    return own.some((item) => item.status === "registered") ? "Active"
      : own.some((item) => item.status === "pending") ? "Payment due"
      : own.some((item) => item.status === "waitlisted") ? "Waitlisted"
      : own.some((item) => item.status === "expired") ? "Expired" : "Not enrolled";
  };

  const term = query.trim().toLowerCase();
  const listed = participants.filter((item) => !term || fullName(item).toLowerCase().includes(term));
  const selected = participants.find((item) => item.id === selectedId) ?? participants[0];

  const athleteRegs = selected
    ? regs.filter((item) => item.participantId === selected.id && item.status !== "withdrawn")
        .sort((a, b) => (campById.get(b.campId)?.startDate ?? "").localeCompare(campById.get(a.campId)?.startDate ?? ""))
    : [];
  const isCompleted = (registration: Registration) => {
    const camp = campById.get(registration.campId);
    return Boolean(camp && registration.paidOn && camp.endDate < today && (registration.status === "registered" || registration.status === "expired"));
  };
  const campsCompleted = new Set(athleteRegs.filter(isCompleted).map((item) => item.campId)).size;
  const activeCamps = athleteRegs.filter((item) => item.status === "registered" && (campById.get(item.campId)?.endDate ?? "") >= today).length;
  const totalPaid = athleteRegs.filter((item) => item.paidOn && (item.status === "registered" || item.status === "expired")).reduce((sum, item) => sum + item.amount, 0);
  const outstanding = athleteRegs.filter((item) => item.status === "pending").reduce((sum, item) => sum + item.amount, 0);

  const history = selected
    ? attendance
        .filter((item) => item.participantId === selected.id && sessionById.has(item.sessionId))
        .map((item) => ({ ...item, session: sessionById.get(item.sessionId)! }))
        .sort((a, b) => `${b.session.date}${b.session.startTime}`.localeCompare(`${a.session.date}${a.session.startTime}`))
    : [];
  const presentCount = history.filter((item) => item.status === "present").length;
  const absentCount = history.filter((item) => item.status === "absent").length;
  const excusedCount = history.filter((item) => item.status === "excused").length;
  const rate = history.length ? Math.round((presentCount / history.length) * 100) : null;
  const lastAttended = history.find((item) => item.status === "present")?.session.date;
  const recentAttended = history.filter((item) => item.status === "present" && item.session.date >= addDays(today, -30)).length;
  const shownHistory = showAllHistory ? history : history.slice(0, 8);

  const athleteVitals = selected ? vitals.filter((item) => item.participantId === selected.id).sort((a, b) => b.recordedOn.localeCompare(a.recordedOn)) : [];
  const knownHeight = athleteVitals.find((item) => item.heightCm !== null)?.heightCm ?? null;
  const bmiOf = (record: VitalRecord) => {
    const height = record.heightCm ?? knownHeight;
    return record.weightKg && height ? (record.weightKg / ((height / 100) ** 2)).toFixed(1) : "—";
  };

  const registerableCamps = selected
    ? camps.filter((camp) => camp.endDate >= today && !registrations.some((item) => item.participantId === selected.id && item.campId === camp.id))
    : [];
  const paymentRegistration = modal?.type === "payment" ? athleteRegs.find((item) => item.id === modal.registrationId) : undefined;
  const paymentCamp = paymentRegistration ? campById.get(paymentRegistration.campId) : undefined;

  async function updateRegistration(registration: Registration, row: Record<string, unknown>) {
    if (!liveClient) return "";
    const { error } = await liveClient.from("camp_registrations").update(row).eq("id", registration.id);
    return error ? error.message : "";
  }

  async function registerForCamp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const camp = camps.find((item) => item.id === String(new FormData(event.currentTarget).get("campId")));
    if (!camp) return;

    setSaving(true);
    setPageError("");
    const result = await createRegistration(liveClient, camp, enrolledByCamp.get(camp.id) ?? 0, selected.id);
    if (result.registration) setRegistrations((current) => [...current, result.registration!]);
    else setPageError(`Could not register athlete: ${result.error}`);
    setSaving(false);
  }

  async function removeFromCamp(registration: Registration) {
    const campName = campById.get(registration.campId)?.name ?? "this camp";
    if (!window.confirm(`Remove this athlete from “${campName}”? Their payment record and attendance for its sessions will also be removed.`)) return;
    setPageError("");
    const campSessionIds = sessions.filter((item) => item.campId === registration.campId).map((item) => item.id);
    if (liveClient) {
      if (campSessionIds.length) {
        const cleared = await liveClient.from("attendance").delete()
          .eq("participant_id", registration.participantId).in("session_id", campSessionIds);
        if (cleared.error) {
          setPageError(`Could not remove athlete from camp: ${cleared.error.message}`);
          return;
        }
      }
      const { error } = await liveClient.from("camp_registrations").delete().eq("id", registration.id);
      if (error) {
        setPageError(`Could not remove athlete from camp: ${error.message}`);
        return;
      }
    }
    setRegistrations((current) => current.filter((item) => item.id !== registration.id));
    setAttendance((current) => current.filter((item) =>
      !(item.participantId === registration.participantId && campSessionIds.includes(item.sessionId))));
  }

  async function savePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paymentRegistration || !paymentCamp) return;
    const form = new FormData(event.currentTarget);
    const values = {
      amount: Number(form.get("amount")),
      paidOn: String(form.get("paidOn")),
      expiresOn: String(form.get("expiresOn")),
      paymentMethod: String(form.get("paymentMethod")),
      paymentReference: String(form.get("paymentReference")).trim(),
    };

    if (values.expiresOn < values.paidOn) {
      setFormError("The valid-until date must be on or after the payment date.");
      return;
    }
    if (values.expiresOn < today) {
      setFormError("The valid-until date has already passed, so the registration would expire immediately.");
      return;
    }
    if (paymentRegistration.status !== "registered" && (enrolledByCamp.get(paymentCamp.id) ?? 0) >= paymentCamp.capacity) {
      setFormError("This camp is full. Free up a place or increase the camp capacity before recording this payment.");
      return;
    }

    setSaving(true);
    setFormError("");
    const failure = await updateRegistration(paymentRegistration, {
      status: "registered", payment_status: "paid", amount: values.amount,
      paid_at: new Date(`${values.paidOn}T12:00:00`).toISOString(), expires_on: values.expiresOn,
      payment_method: values.paymentMethod || null, payment_reference: values.paymentReference || null,
    });
    if (failure) {
      setFormError(`Could not record payment: ${failure}`);
      setSaving(false);
      return;
    }
    setRegistrations((current) => current.map((item) => item.id === paymentRegistration.id
      ? { ...item, status: "registered", paymentStatus: "paid", ...values }
      : item));
    setSaving(false);
    closeModal();
  }

  async function undoPayment(registration: Registration) {
    if (!window.confirm("Mark this registration as not paid? The athlete will leave the camp roster until payment is recorded again.")) return;
    setPageError("");
    const failure = await updateRegistration(registration, {
      status: "pending", payment_status: "unpaid", paid_at: null, expires_on: null, payment_method: null, payment_reference: null,
    });
    if (failure) {
      setPageError(`Could not update payment: ${failure}`);
      return;
    }
    setRegistrations((current) => current.map((item) => item.id === registration.id
      ? { ...item, status: "pending", paymentStatus: "unpaid", paidOn: "", expiresOn: "", paymentMethod: "", paymentReference: "" }
      : item));
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const values = {
      firstName: String(form.get("firstName")).trim(),
      lastName: String(form.get("lastName")).trim(),
      email: String(form.get("email")).trim(),
      guardianName: String(form.get("guardianName")).trim(),
      guardianEmail: String(form.get("guardianEmail")).trim(),
      dateOfBirth: String(form.get("dateOfBirth")),
    };

    setSaving(true);
    setFormError("");
    if (liveClient) {
      const { error } = await liveClient.from("participants").update({
        first_name: values.firstName, last_name: values.lastName, email: values.email || null,
        guardian_name: values.guardianName || null, guardian_email: values.guardianEmail || null,
        date_of_birth: values.dateOfBirth || null,
      }).eq("id", selected.id);
      if (error) {
        setFormError(`Could not save details: ${error.message}`);
        setSaving(false);
        return;
      }
    }
    setParticipants((current) => current.map((item) => item.id === selected.id ? { ...item, ...values } : item));
    setSaving(false);
    closeModal();
  }

  async function saveMedical(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const values = {
      bloodType: text("bloodType"), allergies: text("allergies"), conditions: text("conditions"),
      medications: text("medications"), emergencyName: text("emergencyName"),
      emergencyPhone: text("emergencyPhone"), medicalNotes: text("medicalNotes"),
    };

    setSaving(true);
    setFormError("");
    if (liveClient) {
      const { error } = await liveClient.from("participants").update({
        blood_type: values.bloodType || null, allergies: values.allergies || null,
        medical_conditions: values.conditions || null, medications: values.medications || null,
        emergency_contact_name: values.emergencyName || null, emergency_contact_phone: values.emergencyPhone || null,
        medical_notes: values.medicalNotes || null,
      }).eq("id", selected.id);
      if (error) {
        setFormError(`Could not save medical profile: ${error.message}`);
        setSaving(false);
        return;
      }
    }
    setParticipants((current) => current.map((item) => item.id === selected.id ? { ...item, ...values } : item));
    setSaving(false);
    closeModal();
  }

  async function saveVital(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const values = {
      recordedOn: String(form.get("recordedOn")),
      heightCm: optionalNumber(form.get("heightCm")),
      weightKg: optionalNumber(form.get("weightKg")),
      restingHeartRate: optionalNumber(form.get("restingHeartRate")),
      systolic: optionalNumber(form.get("systolic")),
      diastolic: optionalNumber(form.get("diastolic")),
      notes: String(form.get("notes") ?? "").trim(),
    };

    if (values.heightCm === null && values.weightKg === null && values.restingHeartRate === null && values.systolic === null && values.diastolic === null) {
      setFormError("Enter at least one measurement.");
      return;
    }
    if ((values.systolic === null) !== (values.diastolic === null)) {
      setFormError("Enter both blood pressure numbers (systolic and diastolic), or neither.");
      return;
    }

    setSaving(true);
    setFormError("");
    let id = crypto.randomUUID();
    if (liveClient) {
      const inserted = await liveClient.from("participant_vitals").insert({
        participant_id: selected.id, recorded_on: values.recordedOn, height_cm: values.heightCm,
        weight_kg: values.weightKg, resting_heart_rate: values.restingHeartRate,
        systolic: values.systolic, diastolic: values.diastolic, notes: values.notes || null,
      }).select("id").single();
      if (inserted.error) {
        setFormError(`Could not save record: ${inserted.error.message}`);
        setSaving(false);
        return;
      }
      id = inserted.data.id;
    }
    setVitals((current) => [{ id, participantId: selected.id, ...values }, ...current]);
    setSaving(false);
    closeModal();
  }

  async function deleteVital(record: VitalRecord) {
    if (!window.confirm(`Delete the health record from ${formatDateYear(record.recordedOn)}?`)) return;
    setPageError("");
    if (liveClient) {
      const { error } = await liveClient.from("participant_vitals").delete().eq("id", record.id);
      if (error) {
        setPageError(`Could not delete record: ${error.message}`);
        return;
      }
    }
    setVitals((current) => current.filter((item) => item.id !== record.id));
  }

  function paymentView(registration: Registration) {
    const camp = campById.get(registration.campId);
    if (isCompleted(registration)) return { label: "Completed", cls: "pay-completed", detail: `Camp ended ${formatDateYear(camp?.endDate ?? today)}` };
    if (registration.status === "registered") return { label: "Paid", cls: "pay-paid", detail: `Valid until ${formatDateYear(registration.expiresOn)}` };
    if (registration.status === "expired") return { label: "Expired", cls: "pay-expired", detail: `Expired ${formatDateYear(registration.expiresOn)} — removed from roster` };
    if (registration.status === "waitlisted") return { label: "Waitlisted", cls: "pay-waitlisted", detail: "Camp was full when registered" };
    return { label: "Not paid", cls: "pay-unpaid", detail: `${formatMoney(registration.amount)} due to confirm the place` };
  }

  const age = selected ? ageFrom(selected.dateOfBirth, today) : null;
  const attentionNotes = selected ? [selected.allergies && `Allergies: ${selected.allergies}`, selected.conditions && `Conditions: ${selected.conditions}`].filter(Boolean) : [];

  return (
    <AppShell
      active="athletes"
      breadcrumb="Athlete records"
      campCount={camps.length}
      athleteCount={participants.length}
    >
      <div className="dashboard-content">
        <section className="welcome-row">
          <div>
            <div className="eyebrow"><span className="live-dot" />{client ? "CONNECTED · PRIVATE TO YOUR ACCOUNT" : "DEMO MODE · SAMPLE DATA"}</div>
            <h1>Athlete records</h1>
            <p>Select an athlete to see their camps, payments, health records and attendance.</p>
          </div>
          <Link className="secondary-button" href="/">Back to overview</Link>
        </section>

        {pageError && <p className="camp-alert" role="alert">{pageError}</p>}
        {dataLoading && <p className="camp-alert camp-alert-info" role="status">Loading your data…</p>}

        <div className="athlete-layout">
          <aside className="panel athlete-list-panel" aria-label="Athletes">
            <label className="participant-search athlete-search"><Search size={14} /><input aria-label="Search athletes" placeholder="Search athletes..." value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <div className="athlete-list">
              {listed.length === 0 && <div className="empty-state">{dataLoading ? "Loading…" : participants.length === 0 ? "No athletes yet. Add one from the overview page." : "No athletes match that search."}</div>}
              {listed.map((athlete) => (
                <button className={`athlete-item ${selected?.id === athlete.id ? "athlete-item-active" : ""}`} key={athlete.id} onClick={() => selectAthlete(athlete.id)} type="button">
                  <span className={`athlete-avatar ${avatarFor(fullName(athlete))}`}>{initialsOf(athlete)}</span>
                  <span className="athlete-item-copy"><strong>{fullName(athlete)}</strong><span>{statusOf(athlete.id)}</span></span>
                </button>
              ))}
            </div>
          </aside>

          <div className="athlete-detail">
            {!selected ? (
              <div className="panel"><div className="empty-state">Add an athlete on the overview page to start building their record.</div></div>
            ) : (
              <>
                <section className="panel athlete-header">
                  <span className={`athlete-avatar athlete-avatar-large ${avatarFor(fullName(selected))}`}>{initialsOf(selected)}</span>
                  <div className="athlete-header-copy">
                    <h2>{fullName(selected)}</h2>
                    <p>{[age !== null ? `${age} years old` : "", selected.email, selected.guardianName ? `Guardian: ${selected.guardianName}${selected.guardianEmail ? ` (${selected.guardianEmail})` : ""}` : ""].filter(Boolean).join(" · ") || "No contact details yet"}</p>
                  </div>
                  <button className="secondary-button" type="button" onClick={() => openModal({ type: "profile" })}>Edit details</button>
                </section>

                <section className="stats-grid" aria-label="Athlete summary">
                  <article className="stat-card">
                    <div className="stat-top"><span>Camps completed</span><span className="stat-icon stat-icon-mint"><CalendarDays size={17} /></span></div>
                    <div className="stat-value">{campsCompleted}</div>
                    <p className="stat-foot">with Stride · {activeCamps} active now</p>
                  </article>
                  <article className="stat-card">
                    <div className="stat-top"><span>Attendance rate</span><span className="stat-icon stat-icon-peach"><Activity size={17} /></span></div>
                    <div className="stat-value">{rate === null ? "—" : <>{rate}<span className="stat-unit">%</span></>}</div>
                    <p className="stat-foot">{regularity(rate)}</p>
                  </article>
                  <article className="stat-card">
                    <div className="stat-top"><span>Total paid</span><span className="stat-icon stat-icon-lavender"><Tag size={17} /></span></div>
                    <div className="stat-value stat-value-small">{formatMoney(totalPaid)}</div>
                    <p className="stat-foot">{outstanding > 0 ? `${formatMoney(outstanding)} outstanding` : "Nothing outstanding"}</p>
                  </article>
                  <article className="stat-card">
                    <div className="stat-top"><span>Last attended</span><span className="stat-icon stat-icon-yellow"><Check size={17} /></span></div>
                    <div className="stat-value stat-value-small">{lastAttended ? formatDateYear(lastAttended) : "—"}</div>
                    <p className="stat-foot">{recentAttended} {recentAttended === 1 ? "session" : "sessions"} in the last 30 days</p>
                  </article>
                </section>

                <section className="panel detail-panel" id="camps-payments">
                  <div className="panel-heading">
                    <div><h2>Camps &amp; payments</h2><p>A paid place is valid until its expiry date, then the athlete leaves the camp automatically.</p></div>
                  </div>
                  {athleteRegs.length === 0 ? (
                    <div className="empty-state">Not registered for any camp yet.</div>
                  ) : (
                    <div className="participant-table-wrap">
                      <table className="participant-table payments-table">
                        <thead><tr><th>CAMP</th><th>PRICE</th><th>PAYMENT</th><th><span className="sr-only">Actions</span></th></tr></thead>
                        <tbody>{athleteRegs.map((registration) => {
                          const camp = campById.get(registration.campId);
                          const view = paymentView(registration);
                          const completed = isCompleted(registration);
                          return (
                            <tr key={registration.id}>
                              <td><strong className="cell-title">{camp?.name ?? "Camp"}</strong><span className="cell-sub">{camp ? `${formatDate(camp.startDate)} – ${formatDate(camp.endDate)} · ${camp.location}` : ""}</span></td>
                              <td>{registration.amount > 0 ? formatMoney(registration.amount) : "Free"}</td>
                              <td><span className={`pay-badge ${view.cls}`}>{view.label}</span><span className="cell-sub">{view.detail}{registration.paidOn && registration.status !== "pending" ? ` · paid ${formatDateYear(registration.paidOn)}${registration.paymentMethod ? ` (${registration.paymentMethod})` : ""}` : ""}</span></td>
                              <td>
                                <div className="row-actions">
                                  {!completed && registration.status !== "registered" && <button className="row-edit" type="button" onClick={() => openModal({ type: "payment", registrationId: registration.id })}>{registration.status === "expired" ? "Renew" : "Record payment"}</button>}
                                  {!completed && registration.status === "registered" && registration.amount > 0 && <button className="row-delete" type="button" onClick={() => undoPayment(registration)}>Undo payment</button>}
                                  {!completed && <button className="row-delete" type="button" aria-label={`Remove from ${camp?.name ?? "camp"}`} onClick={() => removeFromCamp(registration)}>Remove</button>}
                                </div>
                              </td>
                            </tr>
                          );
                        })}</tbody>
                      </table>
                    </div>
                  )}
                  {registerableCamps.length > 0 && (
                    <form className="inline-form" key={registerableCamps.map((camp) => camp.id).join(",")} onSubmit={registerForCamp}>
                      <label>Register for another camp
                        <select defaultValue={registerableCamps[0].id} name="campId">
                          {registerableCamps.map((camp) => (
                            <option key={camp.id} value={camp.id}>{camp.name} ({formatDate(camp.startDate)} – {formatDate(camp.endDate)}) — {camp.price > 0 ? formatMoney(camp.price) : "Free"}{(enrolledByCamp.get(camp.id) ?? 0) >= camp.capacity ? " · full, waitlist" : ""}</option>
                          ))}
                        </select>
                      </label>
                      <button className="secondary-button" disabled={saving} type="submit"><UserPlus size={16} />Register</button>
                    </form>
                  )}
                </section>

                <section className="panel detail-panel" id="medical">
                  <div className="panel-heading">
                    <div><h2>Medical profile</h2><p>Kept private to your account. Share only with people who need it for safety.</p></div>
                    <button className="secondary-button small-button" type="button" onClick={() => openModal({ type: "medical" })}>Edit</button>
                  </div>
                  {attentionNotes.length > 0 && <div className="medical-alert" role="note">{attentionNotes.join(" · ")}</div>}
                  <dl className="kv-grid">
                    <div><dt>Date of birth</dt><dd>{selected.dateOfBirth ? `${formatDateYear(selected.dateOfBirth)}${age !== null ? ` (${age})` : ""}` : "—"}</dd></div>
                    <div><dt>Blood type</dt><dd>{selected.bloodType || "—"}</dd></div>
                    <div><dt>Allergies</dt><dd>{selected.allergies || "—"}</dd></div>
                    <div><dt>Medical conditions</dt><dd>{selected.conditions || "—"}</dd></div>
                    <div><dt>Medications</dt><dd>{selected.medications || "—"}</dd></div>
                    <div><dt>Emergency contact</dt><dd>{selected.emergencyName || selected.emergencyPhone ? `${selected.emergencyName}${selected.emergencyName && selected.emergencyPhone ? " · " : ""}${selected.emergencyPhone}` : "—"}</dd></div>
                    <div className="kv-wide"><dt>Notes</dt><dd>{selected.medicalNotes || "—"}</dd></div>
                  </dl>
                </section>

                <section className="panel detail-panel" id="vitals">
                  <div className="panel-heading">
                    <div><h2>Fitness &amp; vital records</h2><p>Measurements over time, newest first.</p></div>
                    <button className="secondary-button small-button" type="button" onClick={() => openModal({ type: "vital" })}><Plus size={14} />Add record</button>
                  </div>
                  {athleteVitals.length === 0 ? (
                    <div className="empty-state"><HeartPulse size={18} /> No measurements yet. Add height, weight, resting heart rate or blood pressure.</div>
                  ) : (
                    <div className="participant-table-wrap">
                      <table className="participant-table">
                        <thead><tr><th>DATE</th><th>HEIGHT</th><th>WEIGHT</th><th>BMI</th><th>RESTING HR</th><th>BLOOD PRESSURE</th><th>NOTES</th><th><span className="sr-only">Actions</span></th></tr></thead>
                        <tbody>{athleteVitals.map((record) => (
                          <tr key={record.id}>
                            <td>{formatDateYear(record.recordedOn)}</td>
                            <td>{record.heightCm !== null ? `${record.heightCm} cm` : "—"}</td>
                            <td>{record.weightKg !== null ? `${record.weightKg} kg` : "—"}</td>
                            <td>{bmiOf(record)}</td>
                            <td>{record.restingHeartRate !== null ? `${record.restingHeartRate} bpm` : "—"}</td>
                            <td>{record.systolic !== null && record.diastolic !== null ? `${record.systolic}/${record.diastolic}` : "—"}</td>
                            <td className="cell-wrap">{record.notes || "—"}</td>
                            <td><button className="row-delete" type="button" aria-label={`Delete record from ${formatDateYear(record.recordedOn)}`} onClick={() => deleteVital(record)}>Delete</button></td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section className="panel detail-panel" id="attendance">
                  <div className="panel-heading">
                    <div><h2>Attendance &amp; regularity</h2><p>{history.length === 0 ? "No attendance recorded yet." : `${regularity(rate)} · ${presentCount} present, ${absentCount} absent, ${excusedCount} excused`}</p></div>
                  </div>
                  {history.length > 0 && (
                    <>
                      <div className="participant-table-wrap">
                        <table className="participant-table">
                          <thead><tr><th>DATE</th><th>SESSION</th><th>CAMP</th><th>STATUS</th></tr></thead>
                          <tbody>{shownHistory.map((item) => (
                            <tr key={`${item.sessionId}-${item.participantId}`}>
                              <td>{formatDateYear(item.session.date)}</td>
                              <td>{item.session.title}</td>
                              <td>{campById.get(item.session.campId)?.name ?? "—"}</td>
                              <td><span className={`attend-badge attend-${item.status}`}>{item.status === "present" ? "Present" : item.status === "absent" ? "Absent" : "Excused"}</span></td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                      {history.length > 8 && (
                        <div className="panel-footer"><span>Showing {shownHistory.length} of {history.length} sessions</span><button className="text-link" type="button" onClick={() => setShowAllHistory(!showAllHistory)}>{showAllHistory ? "Show fewer" : "Show all"} <ArrowRight size={15} /></button></div>
                      )}
                    </>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </div>

      {modal?.type === "profile" && selected && (
        <div className="modal-backdrop" onMouseDown={backdropClose}>
          <section aria-labelledby="profile-title" aria-modal="true" className="camp-modal" role="dialog">
            <div className="modal-heading"><div><span className="modal-icon"><UserPlus size={18} /></span><h2 id="profile-title">Edit details</h2><p>Contact and guardian information.</p></div><button className="icon-button" aria-label="Close dialog" onClick={closeModal} type="button"><X size={19} /></button></div>
            <form className="camp-form" onSubmit={saveProfile}>
              <div className="form-row"><label>First name<input autoFocus defaultValue={selected.firstName} name="firstName" required maxLength={80} /></label><label>Last name<input defaultValue={selected.lastName} name="lastName" required maxLength={80} /></label></div>
              <label>Date of birth<input defaultValue={selected.dateOfBirth} max={today} name="dateOfBirth" type="date" /></label>
              <label>Athlete email<input defaultValue={selected.email} name="email" type="email" /></label>
              <div className="form-row"><label>Guardian name<input defaultValue={selected.guardianName} name="guardianName" /></label><label>Guardian email<input defaultValue={selected.guardianEmail} name="guardianEmail" type="email" /></label></div>
              {formError && <p className="camp-alert" role="alert">{formError}</p>}
              <div className="modal-actions"><button className="secondary-button" onClick={closeModal} type="button">Cancel</button><button className="primary-button" disabled={saving} type="submit">{saving ? "Saving…" : "Save changes"}</button></div>
            </form>
          </section>
        </div>
      )}

      {modal?.type === "medical" && selected && (
        <div className="modal-backdrop" onMouseDown={backdropClose}>
          <section aria-labelledby="medical-title" aria-modal="true" className="camp-modal" role="dialog">
            <div className="modal-heading"><div><span className="modal-icon"><HeartPulse size={18} /></span><h2 id="medical-title">Medical profile</h2><p>{fullName(selected)}</p></div><button className="icon-button" aria-label="Close dialog" onClick={closeModal} type="button"><X size={19} /></button></div>
            <form className="camp-form" onSubmit={saveMedical}>
              <label>Blood type
                <select defaultValue={selected.bloodType} name="bloodType">
                  <option value="">Unknown</option>
                  {bloodTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label>Allergies<textarea autoFocus defaultValue={selected.allergies} name="allergies" rows={2} placeholder="e.g. Peanuts, penicillin" /></label>
              <label>Medical conditions<textarea defaultValue={selected.conditions} name="conditions" rows={2} placeholder="e.g. Asthma" /></label>
              <label>Medications<textarea defaultValue={selected.medications} name="medications" rows={2} /></label>
              <div className="form-row"><label>Emergency contact<input defaultValue={selected.emergencyName} name="emergencyName" /></label><label>Emergency phone<input defaultValue={selected.emergencyPhone} name="emergencyPhone" type="tel" /></label></div>
              <label>Other notes<textarea defaultValue={selected.medicalNotes} name="medicalNotes" rows={3} /></label>
              {formError && <p className="camp-alert" role="alert">{formError}</p>}
              <div className="modal-actions"><button className="secondary-button" onClick={closeModal} type="button">Cancel</button><button className="primary-button" disabled={saving} type="submit">{saving ? "Saving…" : "Save profile"}</button></div>
            </form>
          </section>
        </div>
      )}

      {modal?.type === "vital" && selected && (
        <div className="modal-backdrop" onMouseDown={backdropClose}>
          <section aria-labelledby="vital-title" aria-modal="true" className="camp-modal" role="dialog">
            <div className="modal-heading"><div><span className="modal-icon"><HeartPulse size={18} /></span><h2 id="vital-title">Add a health record</h2><p>{fullName(selected)} — fill in what was measured.</p></div><button className="icon-button" aria-label="Close dialog" onClick={closeModal} type="button"><X size={19} /></button></div>
            <form className="camp-form" onSubmit={saveVital}>
              <label>Date<input defaultValue={today} max={today} name="recordedOn" type="date" required /></label>
              <div className="form-row"><label>Height (cm)<input autoFocus name="heightCm" type="number" step="0.1" min="30" max="260" /></label><label>Weight (kg)<input name="weightKg" type="number" step="0.1" min="5" max="400" /></label></div>
              <label>Resting heart rate (bpm)<input name="restingHeartRate" type="number" min="20" max="250" /></label>
              <div className="form-row"><label>Blood pressure — systolic<input name="systolic" type="number" min="50" max="260" /></label><label>Diastolic<input name="diastolic" type="number" min="30" max="160" /></label></div>
              <label>Notes<input name="notes" placeholder="Optional" maxLength={300} /></label>
              {formError && <p className="camp-alert" role="alert">{formError}</p>}
              <div className="modal-actions"><button className="secondary-button" onClick={closeModal} type="button">Cancel</button><button className="primary-button" disabled={saving} type="submit">{saving ? "Saving…" : <><Plus size={17} />Add record</>}</button></div>
            </form>
          </section>
        </div>
      )}

      {modal?.type === "payment" && paymentRegistration && paymentCamp && selected && (
        <div className="modal-backdrop" onMouseDown={backdropClose}>
          <section aria-labelledby="payment-title" aria-modal="true" className="camp-modal" role="dialog">
            <div className="modal-heading"><div><span className="modal-icon"><Tag size={18} /></span><h2 id="payment-title">Record payment</h2><p>{fullName(selected)} · {paymentCamp.name} ({formatMoney(paymentCamp.price)})</p></div><button className="icon-button" aria-label="Close dialog" onClick={closeModal} type="button"><X size={19} /></button></div>
            <form className="camp-form" onSubmit={savePayment}>
              <div className="form-row"><label>Amount paid<input autoFocus defaultValue={paymentRegistration.amount || paymentCamp.price} min="0" name="amount" step="0.01" type="number" required /></label><label>Payment date<input defaultValue={today} max={today} name="paidOn" type="date" required /></label></div>
              <label>Valid until<input defaultValue={paymentCamp.endDate >= today ? paymentCamp.endDate : today} name="expiresOn" type="date" required /></label>
              <p className="field-hint">After this date the athlete is removed from the camp automatically, until a new payment is recorded.</p>
              <div className="form-row">
                <label>Method<select defaultValue="Cash" name="paymentMethod">{paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select></label>
                <label>Reference (optional)<input name="paymentReference" maxLength={100} placeholder="Receipt or transfer no." /></label>
              </div>
              {formError && <p className="camp-alert" role="alert">{formError}</p>}
              <div className="modal-actions"><button className="secondary-button" onClick={closeModal} type="button">Cancel</button><button className="primary-button" disabled={saving} type="submit">{saving ? "Saving…" : "Confirm payment"}</button></div>
            </form>
          </section>
        </div>
      )}
    </AppShell>
  );
}

export default function ParticipantsPage() {
  return (
    <Suspense fallback={null}>
      <AthleteRecords />
    </Suspense>
  );
}
