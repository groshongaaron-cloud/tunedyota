// Shared AMSOIL catalog naming + categorization rules. Imported by
// amsoil-catalog.mjs (full rebuild from the sitemap) and
// amsoil-recategorize.mjs (re-apply rules to the existing catalog in place)
// so the two can never drift.

export const ACRONYM = { atf: "ATF", atv: "ATV", utv: "UTV", suv: "SUV", rv: "RV", hd: "HD", xl: "XL",
  ls: "LS", vw: "VW", ms: "MS", fs: "FS", ez: "EZ", oe: "OE", gl: "GL", api: "API", led: "LED", usb: "USB",
  cvt: "CVT", dct: "DCT", dot: "DOT", mtf: "MTF", mtg: "MTG", agl: "AGL", atv_utv: "ATV/UTV", uv: "UV",
  hp: "HP", cv: "CV", gtl: "GTL", tdt: "TDT", vtwin: "V-Twin", suvs: "SUVs", oai: "OAI", mp: "MP",
  "4t": "4T", ups: "UPS" };

export function cleanName(name) {
  let n = name
    .replace(/\b(\d{1,3})w[\s-](\d{1,3})\b/gi, (_, a, b) => `${a}W-${b}`)   // 0w 16 -> 0W-16
    .replace(/\b100 synthetic\b/gi, "100% Synthetic")
    .replace(/\bbriggs stratton\b/gi, "Briggs & Stratton")
    .replace(/\bsae\b/gi, "SAE")
    .replace(/\s{2,}/g, " ");
  n = n.split(" ").map((w) => ACRONYM[w.toLowerCase()] || w).join(" ");
  return n.trim();
}

// Primary category by keyword (priority order — first match wins). Ordered so the
// more specific buckets win before the general ones.
export const CATS = [
  ["Merch & Apparel", /\b(t-?shirts?|hoodies?|hats?|caps?|beanies?|jackets?|apparel|decals?|stickers?|banners?|signs?|posters?|flags?|tents?|ez-?ups?|canopy|gloves?|towels?|mats?|keychains?|mugs?|bottle openers?|lanyards?|gifts?|books?|manuals?|brochures?|catalogs?|pens?|magnets?|patch(es)?|price list)\b/i],
  ["Oil Analysis & Test Kits", /oil analyzers|\boai\b|oil sample|sample kit|test kit|fuel contamination test|fuel performance test/i],
  ["Fuel Additives", /fuel additive|cetane|injector|cold flow|4-in-1|fuel stabilizer|gasoline stabilizer|octane|upper (lube|cylinder)|dominator.*fuel|fuel system|ethanol/i],
  ["Filters", /filter|\bea\b/i],
  ["Transmission Fluid", /transmission|\batf\b|\bcvt\b|\bdct\b|torque[- ]drive|synchromesh|dsg|dual-clutch/i],
  ["Gear Lube", /gear lube|severe gear|gear oil|\bagl\b|75w|80w|85w|differential/i],
  ["Diesel Oil", /diesel oil|diesel.*motor oil|heavy-?duty.*(diesel|oil)|dme|dominator.*diesel/i],
  ["Motor Oil", /motor oil|hybrid.*oil|european.*oil|high-?mileage|z-rod|break[- ]in oil|synthetic blend|signature series [0-9]|^(?!.*2[- ]stroke).*racing oil|freedom series|natural gas engine oil/i],
  ["Powersports", /atv|utv|motorcycle|marine|snowmobile|dirt bike|scooter|watercraft|metric|v[- ]?twin|interceptor|saber|outboard|2[- ]stroke|4[- ]stroke|2[- ]cycle|4[- ]cycle|fork oil|shock|dominator|small engine|lawn/i],
  ["Chassis & Brake", /\bbrake\b|dot [0-9]|power steering|shock therapy|suspension/i],
  ["Industrial & Shop", /compressor|air tool|hydraulic|way oil|slip lock|industrial|guardian|\bpump\b/i],
  ["Grease", /grease/i],
  ["Chain & Bar", /chain|bar and chain/i],
  ["Coolant", /coolant|antifreeze|propylene|dominator.*coolant/i],
  ["Cleaners & Care", /degreaser|cleaner|wash|flush|mud|hand scrub|wipe|protect(ant|or)|polish|wax|detailer|shampoo|ceramic spray|silicone spray|fogging/i],
  ["Additives & Treatments", /additive|stabilizer|treatment|boost|conditioner|break-in|assembly lube|engine flush|oil.*restore/i],
];

export function categorize(name, code) {
  if (/^G\d/i.test(code)) return "Merch & Apparel";               // G#### = promo/merchandise
  if (/^GBS/i.test(code)) return "Powersports";                    // Briggs & Stratton small-engine oils
  if (/^(BP|BK|BMK|BMT|BU|EABP)/i.test(code)) return "Parts & Fittings";   // bypass hardware/fittings
  for (const [c, re] of CATS) if (re.test(name)) return c;
  return "Other Specialty";
}
