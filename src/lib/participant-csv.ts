import { parseCsv } from "./csv.ts";

export type ImportRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  guardian_name: string;
  guardian_email: string;
  active: "active" | "inactive";
  paid: "paid" | "unpaid";
};

const requiredColumns = ["id", "first_name", "last_name", "email", "guardian_name", "guardian_email", "active", "paid"] as const;
export const importColumns = [...requiredColumns, "phone"] as const;

export function parseParticipantCsv(text: string): ImportRow[] {
  const rows = parseCsv(text, requiredColumns, ["phone"]);
  const seen = new Set<string>();
  return rows.map((cells, index) => {
    const line = index + 2;
    const get = (name: typeof importColumns[number]) => (cells[importColumns.indexOf(name)] ?? "").replace(/^'(?='|\s*[=+\-@\t\r])/, "");
    const optional = (name: "id" | "email" | "guardian_name" | "guardian_email" | "phone") => {
      const value = get(name);
      return value === "." ? "" : value;
    };
    const id = optional("id").toLowerCase();
    const first_name = get("first_name");
    const last_name = get("last_name");
    const email = optional("email");
    const guardian_name = optional("guardian_name");
    const guardian_email = optional("guardian_email");
    const active = get("active").toLowerCase();
    const paid = get("paid").toLowerCase();
    if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new Error(`Row ${line}: invalid athlete ID.`);
    if (id && seen.has(id)) throw new Error(`Row ${line}: duplicate athlete ID.`);
    if (id) seen.add(id);
    if (!first_name || !last_name || first_name.length > 80 || last_name.length > 80) throw new Error(`Row ${line}: first and last names are required and must be at most 80 characters.`);
    if ([email, guardian_email].some((value) => value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) throw new Error(`Row ${line}: invalid email address.`);
    if (active !== "active" && active !== "inactive") throw new Error(`Row ${line}: active must be active or inactive.`);
    if (paid !== "paid" && paid !== "unpaid") throw new Error(`Row ${line}: paid must be paid or unpaid.`);
    return { id, first_name, last_name, email, guardian_name, guardian_email, active, paid, ...(cells.length > requiredColumns.length ? { phone: optional("phone") } : {}) };
  });
}
