import test from "node:test";
import assert from "node:assert/strict";
import { parseParticipantCsv } from "../src/lib/participant-csv.ts";
import { parseSessionCsv, uniqueSessionRows } from "../src/lib/session-csv.ts";
import { campDays, defaultSessionDays, registrationView, startingRegistration, withExpiry } from "../src/lib/camp-model.ts";

const headers = "id,first_name,last_name,email,guardian_name,guardian_email,active,paid";
const camp = { id: "c", name: "Camp", location: "Malé", startDate: "2026-11-01", endDate: "2026-11-07", ageGroup: "All", capacity: 1, price: 100 };

test("CSV parses quoted commas, escaped quotes, line breaks and BOM", () => {
  const rows = parseParticipantCsv(`\uFEFF${headers}\r\n,"A, B","O""Neil",,"Guardian\nName",,active,unpaid\r\n`);
  assert.equal(rows[0].first_name, "A, B");
  assert.equal(rows[0].last_name, 'O"Neil');
  assert.equal(rows[0].guardian_name, "Guardian\nName");
});

test("CSV rejects malformed files, duplicate IDs and invalid statuses", () => {
  assert.throws(() => parseParticipantCsv(`${headers}\n,"broken,name,,,,active,paid`), /Unclosed/);
  const id = "11d02710-454d-4c7a-90f4-4b6c4e6ded5a";
  assert.throws(() => parseParticipantCsv(`${headers}\n${id},A,B,,,,active,paid\n${id},C,D,,,,active,paid`), /duplicate/);
  assert.throws(() => parseParticipantCsv(`${headers}\n,A,B,,,,yes,paid`), /active must/);
  assert.throws(() => parseParticipantCsv(`${headers}\n,A,B,,,,active,paid,extra`), /expected 8/);
});

test("spreadsheet-safe escaped values round trip", () => {
  const [row] = parseParticipantCsv(`${headers}\n,"'=formula","''literal",,,,active,unpaid`);
  assert.equal(row.first_name, "=formula");
  assert.equal(row.last_name, "'literal");
});

test("session CSV validates rows and supports reordered headers and quoted titles", () => {
  const rows = parseSessionCsv('date,title,end_time,start_time\n2026-11-02,"Drills, passing",21:00,20:00', camp);
  assert.deepEqual(rows, [{ title: "Drills, passing", date: "2026-11-02", startTime: "20:00", endTime: "21:00" }]);
  assert.throws(() => parseSessionCsv("title,date,start_time,end_time\nTraining,2026-02-30,20:00,21:00", camp), /valid YYYY-MM-DD/);
  assert.throws(() => parseSessionCsv("title,date,start_time,end_time\nTraining,2026-11-08,20:00,21:00", camp), /within the selected camp/);
  assert.throws(() => parseSessionCsv("title,date,start_time,end_time\nTraining,2026-11-02,25:00,26:00", camp), /24-hour/);
  assert.throws(() => parseSessionCsv("title,date,start_time,end_time\nTraining,2026-11-02,21:00,20:00", camp), /end time/);
  assert.throws(() => parseSessionCsv("title,date,start_time,end_time\n,2026-11-02,20:00,21:00", camp), /title is required/);
});

test("session import skips matching existing and earlier rows", () => {
  const rows = parseSessionCsv("title,date,start_time,end_time\nOne,2026-11-02,20:00,21:00\nTwo,2026-11-03,20:00,21:00\nThree,2026-11-03,20:00,22:00", camp);
  const result = uniqueSessionRows(rows, [{ date: "2026-11-02", startTime: "20:00" }]);
  assert.equal(result.skipped, 2);
  assert.deepEqual(result.rows.map((row) => row.title), ["Two"]);
});

test("unpaid athletes can be active and expired payments do not remove them", () => {
  const draft = startingRegistration(camp, 0);
  assert.equal(draft.status, "registered");
  assert.equal(draft.paymentStatus, "unpaid");
  assert.equal(startingRegistration(camp, 1).status, "waitlisted");
  const registration = { id: "r", campId: "c", participantId: "p", ...draft, paymentStatus: "paid", paidOn: "2026-11-01", expiresOn: "2026-11-07" };
  const expired = withExpiry(registration, "2026-11-08");
  assert.equal(expired.status, "registered");
  assert.equal(expired.paymentStatus, "expired");
  assert.equal(registrationView(expired, camp, "2026-11-08").label, "Expired");
});

test("location weekday defaults cover the complete camp", () => {
  assert.deepEqual(defaultSessionDays(camp), ["2026-11-02", "2026-11-04", "2026-11-07"]);
  assert.deepEqual(defaultSessionDays({ ...camp, location: "Hulhumalé" }), ["2026-11-01", "2026-11-02", "2026-11-05"]);
  assert.equal(campDays({ ...camp, endDate: "2027-03-15" }).length, 135);
});
