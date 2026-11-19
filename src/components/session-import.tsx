"use client";

import { useState, type ChangeEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { insertSessions, type Camp, type CampSession } from "@/lib/camp-model";
import { parseSessionCsv, sessionImportColumns, uniqueSessionRows, type SessionImportRow } from "@/lib/session-csv";

type Props = {
  camp: Camp;
  sessions: CampSession[];
  client: SupabaseClient | null;
  onImported: (sessions: CampSession[]) => void;
};

export function SessionImport({ camp, sessions, client, onImported }: Props) {
  const [rows, setRows] = useState<SessionImportRow[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const preview = uniqueSessionRows(rows, sessions);

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([`${sessionImportColumns.join(",")}\r\n`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "session-import-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    setRows([]);
    setError("");
    setNotice("");
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error("CSV file must be 1 MB or smaller.");
      setRows(parseSessionCsv(await file.text(), camp));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not read the file.");
    }
  }

  async function submit() {
    const { rows: ready, skipped } = uniqueSessionRows(rows, sessions);
    if (!ready.length) {
      setError("All rows match existing or earlier sessions at the same date and start time.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await insertSessions(client, camp.id, ready);
      if (result.error) {
        setError(`Could not import sessions: ${result.error}`);
        return;
      }
      onImported(result.sessions);
      setRows([]);
      setNotice(`Added ${ready.length} ${ready.length === 1 ? "session" : "sessions"}${skipped ? `; skipped ${skipped} matching ${skipped === 1 ? "row" : "rows"}` : ""}.`);
    } catch (problem) {
      setError(`Could not import sessions: ${problem instanceof Error ? problem.message : "Unknown error"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details>
      <summary>Bulk import sessions from CSV</summary>
      <div className="camp-form">
      <p className="field-hint">Download the template and add a row for each session. Use YYYY-MM-DD dates within this camp and 24-hour HH:MM times. Rows matching an existing session or earlier row by date and start time are skipped. Maximum 1,000 rows and 1 MB.</p>
      <div><button className="secondary-button" type="button" onClick={downloadTemplate}>Download session template</button></div>
      <label>Session CSV file<input type="file" accept=".csv,text/csv" disabled={busy} onChange={selectFile} /></label>
      {rows.length > 0 && <p role="status">{preview.rows.length} sessions ready; {preview.skipped} matching rows will be skipped.</p>}
      {error && <p className="camp-alert" role="alert">{error}</p>}
      {notice && <p className="camp-alert camp-alert-info" role="status">{notice}</p>}
      <div><button className="primary-button" type="button" disabled={!rows.length || busy} onClick={submit}>{busy ? "Importing…" : "Import sessions"}</button></div>
      {!client && <p className="demo-note">Demo only: changes are not saved after a refresh.</p>}
      </div>
    </details>
  );
}
