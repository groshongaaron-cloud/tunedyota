# Tuned Yota — End-to-End Workflow

How the whole system fits together, from a stranger discovering the brand to a tuned
customer who comes back and refers others — and the technical pipeline + automation
underneath it. The Mermaid below renders visually on GitHub; a portable brand-styled
PNG is committed at [`tuned-yota-workflow.png`](tuned-yota-workflow.png) (regenerate with
`node docs/architecture/render-workflow.js`).

![Tuned Yota end-to-end workflow](tuned-yota-workflow.png)

```mermaid
flowchart TD
  classDef acq fill:#B3D0D9,stroke:#5B4B42,color:#23303a;
  classDef site fill:#3A2E26,stroke:#3A2E26,color:#F3EFEA;
  classDef proc fill:#FAF9F7,stroke:#5B4B42,color:#3A2E26;
  classDef auto fill:#DFC4B5,stroke:#5B4B42,color:#3A2E26;
  classDef data fill:#99A08E,stroke:#5B4B42,color:#1f261b;

  subgraph ACQ["① Acquisition — get found"]
    direction LR
    SEO["SEO / AEO pages<br/>vehicle · state · guides · dyno proof"]
    SOCIAL["Social: IG · FB · YouTube · TikTok<br/>+ Midwest Tuning Group"]
    GBP["Google Business Profile<br/>local 'near me'"]
    ADS["Paid: Meta / TikTok<br/>retarget via Pixel"]
    FORUMS["Reddit / forums<br/>lead-radar routine"]
  end

  SITE["tunedyota.com<br/>Meta Pixel + UTM tracking"]:::site
  ACQ --> SITE

  subgraph CONV["② Conversion"]
    FYT["Find Your Exact Tune<br/>pick vehicle → instant price"]
    BOOK["Book a slot<br/>event city + time"]
    LEAD["Lead / waitlist<br/>no event yet"]
  end
  SITE --> FYT --> BOOK
  FYT --> LEAD
  SITE -. beacons .-> TRACK["track.js →<br/>Funnel Events"]:::data

  subgraph PROC["③ Booking pipeline · netlify/functions/book.js"]
    ROUTE["routing.js<br/>market → installer"]
    AT["airtable.js<br/>Bookings + Priority List"]:::data
    MAIL["resend.js<br/>installer + customer email + .ics"]
    ALERT["alert.js → Slack<br/>on email failure"]
  end
  BOOK --> ROUTE --> AT --> MAIL
  LEAD --> AT
  MAIL -. fail .-> ALERT

  subgraph FULFILL["④ Fulfillment"]
    REMIND["event-reminders.js · 07:00 CT<br/>rosters 30/15/10/2/0d · customer 10/2d · sweep"]
    EVENT["In-person event<br/>OTT tune / supercharger · 5-gas verified"]
    CERT["certificate-dispatch.js<br/>Master Certificate emailed"]
  end
  AT --> REMIND --> EVENT --> CERT

  subgraph RETAIN["⑤ Retention → feeds Acquisition"]
    REVIEW["Review request → Google / GBP<br/>add-review skill → site schema"]
    REBOOK["Priority List rebook<br/>not-completed sweep"]
    CONTENT["Dyno / testimonial content<br/>ad-template kit"]
  end
  CERT --> REVIEW
  EVENT --> REBOOK --> AT
  REVIEW --> CONTENT
  CONTENT -.-> ACQ

  subgraph OPS["⑥ Automation & monitoring"]
    direction LR
    REPORT["submissions-report.js<br/>monthly exec summary"]
    HEALTH["email-health.js<br/>daily canary"]
    ROUTINES["Cloud routines<br/>uptime · freshness · SEO · GSC · lead-radar"]
  end
  TRACK --> REPORT
  MAIL -.-> HEALTH

  class SEO,SOCIAL,GBP,ADS,FORUMS acq;
  class FYT,BOOK,LEAD,ROUTE,MAIL,ALERT,REMIND,EVENT,CERT,REVIEW,REBOOK,CONTENT proc;
  class REPORT,HEALTH,ROUTINES auto;
```

## How to read it
1. **Acquisition** — every channel exists to drive traffic to the site (each with a UTM).
2. **Conversion** — Find Your Exact Tune turns a visitor into a booking or a waitlist lead; `track.js` logs the funnel.
3. **Booking pipeline** — `book.js` routes to the right installer, writes Airtable, sends emails + calendar invite, and alerts Slack only if email fails.
4. **Fulfillment** — scheduled reminders fill the roster; the event happens; the Master Certificate goes out.
5. **Retention** — reviews, rebooks, and content loop straight back into Acquisition — the flywheel.
6. **Automation** — monitoring + reporting keep the whole thing honest without manual checking.

**The flywheel:** every tuned truck becomes proof (dyno, testimonial, review) that feeds
the top of the funnel — which is exactly what the master advertising plan operationalizes.
