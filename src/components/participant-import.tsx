"use client";

import { useState, type ChangeEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { importColumns, parseParticipantCsv, type ImportRow } from "@/lib/participant-csv";
import type { Camp, Participant, Registration } from "@/lib/camp-model";

type Props = {
  client: SupabaseClient | null;
  camps: Camp[];
  participants: Participant[];
  registrations: Registration[];
  onImported: () => Promise<void>;
};

export function ParticipantImport({ client, camps, participants, registrations, onImported }: Props) {
  const [campId, setCampId] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  function download(mode: "template" | "camp" | "all") {
    const selected = registrations.filter((item) => item.campId === campId);
    const people = mode === "all" ? participants : mode === "camp"
      ? selected.map((registration) => {
        const person = participants.find((item) => item.id === registration.participantId);
        if (!person) throw new Error("A registration refers to an unavailable athlete. Reload before exporting.");
        return person;
      }) : [];
    const data = people.map((person) => {
      const registration = selected.find((item) => item.participantId === person.id);
      return [person.id, person.firstName, person.lastName, person.email, person.guardianName, person.guardianEmail,
        registration?.status === "withdrawn" ? "inactive" : "active",
        registration && registration.paymentStatus !== "unpaid" && registration.paidOn ? "paid" : "unpaid", person.phone];
    });
    // Prefix spreadsheet formula-like values to prevent formula execution on opening the CSV.
    const escape = (value: string) => `"${(/^(?:'|[\s]*[=+\-@\t\r])/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
    const csv = [importColumns.join(","), ...data.map((line) => line.map(escape).join(","))].join("\r\n") + "\r\n";
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = mode === "template" ? "athlete-import-template.csv" : mode === "all" ? "all-athletes.csv" : "camp-athletes.csv"; link.click();
    URL.revokeObjectURL(url);
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    setError(""); setNotice(""); setRows([]);
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error("CSV file must be 1 MB or smaller.");
      const parsed = parseParticipantCsv(await file.text());
      const missing = parsed.find((row) => row.id && !participants.some((person) => person.id === row.id));
      if (missing) throw new Error(`Athlete ID ${missing.id} was not found. Reload your data and check the file.`);
      setRows(parsed);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not read the file.");
    }
    event.target.value = "";
  }

  async function submit() {
    if (!client || !campId || !rows.length) return;
    const clearedPayments = rows.filter((row) => row.paid === "unpaid" && registrations.some((registration) =>
      registration.campId === campId && registration.participantId === row.id && Boolean(registration.paidOn))).length;
    if (clearedPayments && !window.confirm(`This will clear payment details for ${clearedPayments} existing registration(s). Continue?`)) return;
    setBusy(true); setError(""); setNotice("");
    const result = await client.rpc("import_camp_participants", { p_camp_id: campId, p_rows: rows });
    if (result.error) {
      setError(`Import failed; no rows were saved: ${result.error.message}`);
      setBusy(false);
      return;
    }
    setRows([]);
    try {
      await onImported();
      setNotice(`Imported ${result.data} rows. Full camps place additional active athletes on the waitlist.`);
    } catch (problem) {
      setError(`The import succeeded, but refreshing failed: ${problem instanceof Error ? problem.message : "Unknown error"}. Reload the page.`);
    }
    setBusy(false);
  }

  return (
    <section className="panel detail-panel" aria-label="Bulk athlete import">
      <div className="panel-heading"><div><h2>Bulk athlete import</h2><p>Choose a camp, then upload a CSV to create or update athletes and their enrollment and payment status.</p></div></div>
      <div className="camp-form">
        <label>Camp<select value={campId} disabled={busy} onChange={(event) => { setCampId(event.target.value); setRows([]); setNotice(""); }}><option value="">Select a camp</option>{camps.map((camp) => <option value={camp.id} key={camp.id}>{camp.name} ({camp.startDate} – {camp.endDate})</option>)}</select></label>
        <div className="panel-actions">
          <button type="button" className="secondary-button" onClick={() => download("template")}>Download template</button>
          <button type="button" className="secondary-button" disabled={!campId} onClick={() => { try { download("camp"); } catch (problem) { setError(problem instanceof Error ? problem.message : "Export failed."); } }}>Export camp athletes</button>
          <button type="button" className="secondary-button" disabled={!campId} onClick={() => download("all")}>Export all athletes</button>
        </div>
        <p className="field-hint">Blank ID creates an athlete; an existing ID updates that athlete. Use active/inactive and paid/unpaid. Optional values may be blank or a single period (.). Blank or period values clear existing optional profile fields; omit the phone column entirely to retain existing phone numbers. Inactive keeps history. Paid defaults to the camp price and dates. Existing paid details are retained unless changed to unpaid. In an all-athlete export, athletes not yet in the selected camp default to active and unpaid; remove rows you do not want to assign. Exported formula-like values are protected for spreadsheet safety.</p>
        <label>CSV file<input type="file" accept=".csv,text/csv" disabled={!campId || !client || busy} onChange={selectFile} /></label>
        {!client && <p className="field-hint">Import requires a signed-in Supabase account; demo data is not saved.</p>}
        {rows.length > 0 && <p role="status">{rows.length} rows ready: {rows.filter((row) => !row.id).length} new, {rows.filter((row) => row.id).length} updates. Import replaces the listed profile fields and selected camp statuses.</p>}
        {error && <p className="camp-alert" role="alert">{error}</p>}
        {notice && <p className="camp-alert camp-alert-info" role="status">{notice}</p>}
        <div><button type="button" className="primary-button" disabled={!client || !campId || !rows.length || busy} onClick={submit}>{busy ? "Importing…" : `Import into ${camps.find((camp) => camp.id === campId)?.name ?? "camp"}`}</button></div>
      </div>
    </section>
  );
}
