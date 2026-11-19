export function parseCsv(text: string, columns: readonly string[]): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closed = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === '"' && cell === "" && !closed) {
      quoted = true;
    } else if (char === "," || char === "\n" || char === "\r") {
      row.push(cell); cell = ""; closed = false;
      if (char !== ",") {
        if (char === "\r" && input[i + 1] === "\n") i++;
        if (row.some((value) => value.trim())) rows.push(row);
        row = [];
      }
    } else {
      if (closed || char === '"') throw new Error("Invalid CSV quoting.");
      cell += char;
    }
  }
  if (quoted) throw new Error("Unclosed quoted CSV field.");
  if (cell || row.length) { row.push(cell); if (row.some((value) => value.trim())) rows.push(row); }
  const headers = rows.shift()?.map((value) => value.trim().toLowerCase());
  if (!headers || headers.length !== columns.length || columns.some((name) => !headers.includes(name)) || new Set(headers).size !== headers.length) {
    throw new Error(`CSV headers must be: ${columns.join(", ")}.`);
  }
  if (!rows.length || rows.length > 1000) throw new Error("The CSV must contain between 1 and 1000 rows.");
  return rows.map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`Row ${index + 2}: expected ${headers.length} columns.`);
    return columns.map((column) => cells[headers.indexOf(column)].trim());
  });
}
