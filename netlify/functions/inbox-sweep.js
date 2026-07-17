// netlify/functions/inbox-sweep.js
// Scheduled: classify info@ mail, ingest OTT leads, create NEPQ reply drafts.
// Safety: NOTHING sends email (createDraft only, never sendReply).
//         Errors leave messages UNLABELED so the next tick retries.
//         One bad message NEVER kills the sweep.
const gmailLib = require("./lib/gmail.js");
const { parseOttLeadEmail } = require("./lib/ott-email.js");
const { classifyEmail, extractLeadFields, askClaude } = require("./lib/email-classify.js");
const { groundingFor, buildDraftPrompt, checkDraftShape } = require("./lib/email-draft.js");
const { notifyOwner } = require("./lib/alert.js");

// newer_than:2d bounds the sweep to FRESH mail — without it, go-live would chew
// through the entire historical inbox 20 msgs/tick, drafting replies to months-old
// threads (the owner's 1-2yr backfill is a separate, deliberate project).
const QUERY = "in:inbox newer_than:2d -label:ty-ingested -label:ty-drafted -label:ty-skipped -label:ty-flagged -from:me";
const CAP = 20;

// Default draft call: reuse askClaude from email-classify with the appropriate model/tokens.
async function defaultDraft(prompt, env) {
  return askClaude(prompt, { apiKey: env.ANTHROPIC_API_KEY, model: "claude-sonnet-4-6", maxTokens: 700 });
}

// Build the lead-ingest URL from env, in priority order.
function ingestUrl(env) {
  return env.LEAD_INGEST_URL
    || (env.URL ? `${env.URL}/.netlify/functions/lead-ingest` : "https://tunedyota.com/.netlify/functions/lead-ingest");
}

// Return the first email address found in a To/Reply-To/From header string.
function firstEmail(s) {
  const m = String(s || "").match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? m[0] : "";
}

// Prefix subject with "Re: " if not already present.
function reSubject(subject) {
  return /^re:/i.test(String(subject || "")) ? subject : `Re: ${subject || ""}`;
}

async function runSweep(deps = {}) {
  const env = deps.env || process.env;
  const log = deps.log || console;

  // Env gate: no Gmail config → skip cleanly.
  if (!env.GMAIL_REFRESH_TOKEN && !deps.gmail) {
    return { scanned: 0, skipped: "no-gmail-config" };
  }

  // Fail-fast: misconfigured task secret must not mislabel leads.
  if (!String(env.INTERNAL_TASK_SECRET || "").trim()) {
    return { scanned: 0, skipped: "no-task-secret" };
  }

  const gmail = deps.gmail || gmailLib;
  const classify = deps.classify || ((msg) => classifyEmail(msg, { apiKey: env.ANTHROPIC_API_KEY }));
  const draft = deps.draft || ((prompt) => defaultDraft(prompt, env));
  const extract = deps.extract || ((msg) => extractLeadFields(msg, { apiKey: env.ANTHROPIC_API_KEY }));
  const postImpl = deps.postImpl || fetch;
  // notify injectable: wraps notifyOwner with env's webhook URL.
  const notify = deps.notify || ((text) => notifyOwner({ webhookUrl: env.SLACK_WEBHOOK_URL, text }));

  // A transient Gmail failure must not crash the scheduler — return error result so
  // unprocessed messages are picked up on the next tick.
  let msgs;
  try {
    msgs = await gmail.listMessages(QUERY, { env });
  } catch (e) {
    return { scanned: 0, error: e.message };
  }

  // Enforce CAP.
  const batch = msgs.slice(0, CAP);

  let scanned = 0, ingested = 0, drafted = 0, flagged = 0, skipped = 0;

  for (const { id } of batch) {
    scanned++;
    try {
      const msg = await gmail.getMessage(id, { env });
      const classification = await classify(msg);

      // ---- OTT lead -------------------------------------------------------
      if (classification.bucket === "ott-lead") {
        let lead = parseOttLeadEmail(msg);

        // If parse yielded no contact info, fall back to LLM extraction.
        if (!lead.phone && !lead.email) {
          lead = await extract(msg);
        }

        // Still no contact info → flag and notify.
        if (!lead || (!lead.phone && !lead.email)) {
          await notify(`OTT-looking email couldn't be parsed — review manually: subject="${msg.headers.subject}" from="${msg.headers.from}"`);
          await gmail.addLabel(id, "ty-flagged", { env });
          flagged++;
          continue;
        }

        const body = {
          name: lead.name, phone: lead.phone, email: lead.email,
          vehicle: lead.vehicle, goals: lead.goals, city: lead.city,
          message: lead.message, channel: lead.channel, source: lead.source,
          ghlLink: lead.ghlLink,
          emailThread: lead.threadId || msg.threadId,
          emailMessageId: lead.messageIdHeader || msg.headers.messageId,
          replyTo: lead.replyTo,
        };

        const res = await postImpl(ingestUrl(env), {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-ty-task": env.INTERNAL_TASK_SECRET || "" },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          await gmail.addLabel(id, "ty-ingested", { env });
          ingested++;
        } else {
          await notify(`⚠️ OTT lead ingest failed (HTTP ${res.status}) for ${msg.headers.subject} — flagged for manual entry`);
          await gmail.addLabel(id, "ty-flagged", { env });
          flagged++;
        }
        continue;
      }

      // ---- Inquiry / thread-reply / sensitive -----------------------------
      if (["inquiry", "thread-reply", "sensitive"].includes(classification.bucket)) {
        const grounding = groundingFor({ city: "", state: "", text: msg.textBody });
        const prompt = buildDraftPrompt({ message: msg, classification, grounding, threadContext: "" });

        let text = await draft(prompt);
        let shape = checkDraftShape(text);

        // One retry on shape failure.
        if (!shape.ok) {
          const problems = shape.problems.join("; ");
          text = await draft(prompt + `\n\nYour previous attempt failed checks: ${problems}. Rewrite it.`);
          shape = checkDraftShape(text);
        }

        if (shape.ok) {
          const to = firstEmail(msg.headers.replyTo) || firstEmail(msg.headers.from);
          const subject = reSubject(msg.headers.subject);
          await gmail.createDraft({
            threadId: msg.threadId,
            to,
            inReplyTo: msg.headers.messageId,
            references: msg.headers.messageId,
            subject,
            body: text,
          }, { env });
          await gmail.addLabel(id, "ty-drafted", { env });
          drafted++;

          // Sensitive: ADDITIONALLY notify Slack and add ty-flagged.
          if (classification.bucket === "sensitive") {
            const draftNote = "A cautious draft is waiting in Gmail.";
            await notify(`🚩 Sensitive email — ${classification.summary || "(no summary)"} · from: ${msg.headers.from} · ${draftNote}`);
            await gmail.addLabel(id, "ty-flagged", { env });
            flagged++;
          }
        } else {
          // Draft still bad after retry → flag, no createDraft.
          if (classification.bucket === "sensitive") {
            await notify(`🚩 Sensitive email — ${classification.summary || "(no summary)"} · from: ${msg.headers.from} · Draft failed shape checks; no draft queued.`);
          }
          await gmail.addLabel(id, "ty-flagged", { env });
          flagged++;
        }
        continue;
      }

      // ---- Automated / spam ----------------------------------------------
      if (["automated", "spam"].includes(classification.bucket)) {
        await gmail.addLabel(id, "ty-skipped", { env });
        skipped++;
        continue;
      }

      // Fallthrough: unknown bucket — leave unlabeled for next tick.
    } catch (e) {
      // Per-message error: log but do NOT label so the next tick retries.
      log.error(`inbox-sweep: error processing message ${id}:`, e.message || e);
      // Non-transient errors (parse failures, programming errors) will never self-heal.
      // Flag them so they stop blocking the CAP, and alert for manual review.
      const isNonTransient = /parse|TypeError|RangeError|SyntaxError/i.test(
        e.constructor?.name || e.name || ""
      ) || /parse|TypeError|RangeError|SyntaxError/i.test(e.message || "");
      if (isNonTransient) {
        try {
          await notify(`⚠️ Non-transient error on message ${id}: ${e.message || e} — flagged for manual review`);
        } catch (_) { /* alerting must never throw */ }
        try {
          await gmail.addLabel(id, "ty-flagged", { env });
          flagged++;
        } catch (_) { /* labeling must never throw */ }
      }
    }
  }

  return { scanned, ingested, drafted, flagged, skipped };
}

async function handler() {
  const out = await runSweep({});
  return { statusCode: 200, body: JSON.stringify(out) };
}

module.exports = { handler, runSweep };
