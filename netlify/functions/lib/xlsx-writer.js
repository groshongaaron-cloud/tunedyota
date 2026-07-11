// Minimal, dependency-free single-sheet .xlsx writer. Produces a valid OOXML
// workbook from an array-of-arrays (header row + data rows) using inline strings
// and a STORE-method (uncompressed) zip container. No npm dependencies, so the
// Netlify function bundle stays lean. Numbers render as numeric cells; everything
// else as text. Returns a Buffer.

// CRC-32 (needed by the zip container).
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// Build a ZIP (STORE method) from [{ name, data:Buffer }].
function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8"), data = f.data, crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    parts.push(local, name, data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8); cen.writeUInt16LE(0, 10); cen.writeUInt16LE(0, 12); cen.writeUInt16LE(0, 14);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(name.length, 28); cen.writeUInt16LE(0, 30); cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34); cen.writeUInt16LE(0, 36); cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, name);
    offset += local.length + name.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, centralBuf, end]);
}

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function colLetter(i) { let s = "", n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function cell(v, ref) {
  if (v === null || v === undefined || v === "") return `<c r="${ref}"/>`;
  if (typeof v === "number" && isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}
// Optional column widths (in Excel character units). `cols` is an array where
// index i is the width for column i+1; a null/0 entry leaves that column default.
function colsXml(cols) {
  if (!Array.isArray(cols) || !cols.some((w) => w)) return "";
  let out = "";
  for (let i = 0; i < cols.length; i++) {
    const w = cols[i];
    if (w) out += `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
  }
  return `<cols>${out}</cols>`;
}
function sheetXml(aoa, cols) {
  let rows = "";
  for (let r = 0; r < aoa.length; r++) {
    let cells = "";
    for (let c = 0; c < aoa[r].length; c++) cells += cell(aoa[r][c], colLetter(c) + (r + 1));
    rows += `<row r="${r + 1}">${cells}</row>`;
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${colsXml(cols)}<sheetData>${rows}</sheetData></worksheet>`;
}

// Excel sheet names: <=31 chars, no : \ / ? * [ ], unique within the workbook.
function sheetName(name, used) {
  let n = String(name == null ? "Sheet" : name).replace(/[:\\/?*[\]]/g, "-").slice(0, 31) || "Sheet";
  const base = n; let i = 1;
  while (used.has(n.toLowerCase())) { n = (base.slice(0, 28) + "_" + (++i)); }
  used.add(n.toLowerCase());
  return n;
}

// Multi-sheet workbook from [{ name, aoa }]. Returns a Buffer.
function buildWorkbook(sheets) {
  const P = "http://schemas.openxmlformats.org/";
  const used = new Set();
  const norm = (sheets || []).map((s) => ({ name: sheetName(s.name, used), aoa: s.aoa || [], cols: s.cols }));
  const overrides = norm.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="${P}package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="${P}package/2006/relationships"><Relationship Id="rId1" Type="${P}officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const sheetTags = norm.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
  const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="${P}spreadsheetml/2006/main" xmlns:r="${P}officeDocument/2006/relationships"><sheets>${sheetTags}</sheets></workbook>`;
  const relTags = norm.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${P}officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("");
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="${P}package/2006/relationships">${relTags}</Relationships>`;
  return zip([
    { name: "[Content_Types].xml", data: Buffer.from(ct, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(rels, "utf8") },
    { name: "xl/workbook.xml", data: Buffer.from(wb, "utf8") },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(wbRels, "utf8") },
    ...norm.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: Buffer.from(sheetXml(s.aoa, s.cols), "utf8") })),
  ]);
}

// Single-sheet convenience. `cols` (optional) = per-column widths.
function buildXlsx(name, aoa, cols) { return buildWorkbook([{ name, aoa, cols }]); }

module.exports = { buildXlsx, buildWorkbook };
