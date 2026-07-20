// Pure builders for the researcher nurture sequence — lead-magnet opt-ins who
// aren't ready to book. Three short, escalating emails that educate and drive to
// the funnel. No I/O; deterministic. Steps are 1..STEPS.
const BOOK = "https://tunedyota.com/find-your-exact-tune";
const STEPS = 3;

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function wrap(bodyHtml) {
  return `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:560px;line-height:1.5">${bodyHtml}` +
    `<p style="font-size:12px;color:#9aa0a6;margin-top:22px">Tuned Yota · Authorized OTT Installer · Upper Midwest · ` +
    `<a href="${BOOK}" style="color:#5B4B42">tunedyota.com</a></p></div>`;
}
function cta(label) {
  return `<p style="margin:18px 0"><a href="${BOOK}" style="display:inline-block;background:#5B4B42;color:#fff;` +
    `text-decoration:none;font-weight:800;font-size:14px;padding:11px 20px;border-radius:8px">${esc(label)} &#9658;</a></p>`;
}

function buildNurtureEmail(step, d = {}) {
  const name = esc(String(d.name || "").trim().split(/\s+/)[0] || "there");
  const veh = esc(d.vehicle || "your Toyota or Lexus");
  if (step === 1) {
    return {
      subject: "What the OTT Tune actually fixes on your Toyota",
      html: wrap(`<h2 style="color:#5B4B42">Hi ${name} — here's the straight story.</h2>
        <p>The OTT Tune isn't a risky mod. It's a factory-flaw fix: it ends the gear hunting, sharpens throttle response, and unlocks the usable low-end torque Toyota left on the table — on ${veh}.</p>
        <ul>
          <li><b>Street-legal.</b> Factory emissions stay intact, 5-gas verified, no check-engine defeat.</li>
          <li><b>In person, never a mailed flash.</b> Calibrated by a licensed VFTuner PRO Tuner at a local event.</li>
          <li><b>Even bone-stock trucks feel it</b> — no mods required.</li>
        </ul>
        ${cta("See pricing & your exact tune")}
        <p style="font-size:13px;color:#7c8472">No pressure — just reply any time with questions about your vehicle.</p>`),
      text: `Hi ${name} — the OTT Tune fixes factory drivability flaws (gear hunting, throttle lag) and unlocks usable low-end torque on ${d.vehicle || "your vehicle"}. Street-legal, 5-gas verified, no MIL defeat, calibrated in person. See pricing: ${BOOK}`,
    };
  }
  if (step === 2) {
    return {
      subject: "Stock vs tuned — what actually changes",
      html: wrap(`<h2 style="color:#5B4B42">The proof, ${name}.</h2>
        <p>On a 5.7L Tundra we see about <b>27 lb-ft more torque arriving ~860 rpm earlier</b> — the difference you feel towing, on bigger tires, and off-road.</p>
        <p><b>94% of owners recommend Tuned Yota.</b> "Trans up/down shifts and power delivery is the smoothest it's ever been." — S. Berry, Tacoma</p>
        ${cta("Find your exact tune")}`),
      text: `Stock vs tuned: ~27 lb-ft more torque ~860 rpm earlier on a 5.7L Tundra. 94% of owners recommend Tuned Yota. Find your exact tune: ${BOOK}`,
    };
  }
  return {
    subject: "Ready when you are — your next local event",
    html: wrap(`<h2 style="color:#5B4B42">Whenever you're ready, ${name}.</h2>
      <p>Tuned Yota calibrates in person at events across the Upper Midwest (MN, IA, WI, ND, SD, NE). Event slots are limited and fill up — pick your vehicle and see the next date near you.</p>
      ${cta("See the next event near me")}
      <p style="font-size:13px;color:#7c8472">Not ready yet? No problem — this is the last note in this short series. We're here when you are.</p>`),
    text: `Tuned Yota calibrates in person at limited-slot events across the Upper Midwest. See the next date near you: ${BOOK}`,
  };
}

module.exports = { buildNurtureEmail, STEPS };
