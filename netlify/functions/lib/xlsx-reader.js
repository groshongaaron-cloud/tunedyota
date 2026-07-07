// Minimal dependency-free .xlsx reader — the read-side companion to xlsx-writer.js.
// Parses the ZIP via its central directory, inflates DEFLATE entries with zlib,
// and reads the first worksheet into an array of row objects keyed by the header
// row. Handles shared-string ("s"), inline-string ("inlineStr"), and literal
// ("str"/number) cells. Sufficient for flat table sheets (no merged cells).
const { readFileSync } = require("node:fs");
const { inflateRawSync } = require("node:zlib");

function unzip(buf) {
  // End Of Central Directory: scan backward for its signature.
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("Not a .xlsx (no ZIP end-of-central-directory)");
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error("Bad central directory entry");
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const comp = buf.subarray(dataStart, dataStart + compSize);
    files.set(name, method === 0 ? comp : inflateRawSync(comp));
    off += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function unescapeXml(s) {
  return String(s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  for (const si of xml.matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)) {
    const texts = [...si[1].matchAll(/<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((t) => t[1]);
    out.push(unescapeXml(texts.join("")));
  }
  return out;
}

function colToIndex(ref) {
  const letters = /^([A-Z]+)/.exec(ref)[1];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function readXlsx(file) {
  const files = unzip(readFileSync(file));
  const shared = parseSharedStrings(files.get("xl/sharedStrings.xml")?.toString("utf8"));
  const sheet = files.get("xl/worksheets/sheet1.xml").toString("utf8");
  const rows = [];
  for (const rowM of sheet.matchAll(/<(?:\w+:)?row[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    const cells = [];
    for (const cM of rowM[1].matchAll(/<(?:\w+:)?c r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/(?:\w+:)?c>/g)) {
      const idx = colToIndex(cM[1]);
      const tType = /t="([^"]+)"/.exec(cM[2])?.[1];
      const inner = cM[3];
      let val = "";
      if (tType === "s") {
        const vi = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner);
        val = vi ? shared[parseInt(vi[1], 10)] : "";
      } else if (tType === "inlineStr") {
        const ti = /<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/.exec(inner);
        val = ti ? unescapeXml(ti[1]) : "";
      } else {
        const vi = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner);
        val = vi ? unescapeXml(vi[1]) : "";
      }
      cells[idx] = val;
    }
    rows.push(cells);
  }
  const header = (rows[0] || []).map((h) => String(h).trim());
  return rows.slice(1)
    .filter((r) => r.some((v) => v != null && v !== ""))
    .map((r) => {
      const o = {};
      header.forEach((h, i) => { o[h] = r[i] == null ? "" : r[i]; });
      return o;
    });
}

module.exports = { readXlsx };
