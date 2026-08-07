# Tuned Yota — YouTube Channel Taxonomy & SEO/AEO Playbook

**Channel name:** Tuned Yota
**Tagline / positioning:** *Toyota & Lexus Tech Talk* — the single most comprehensive factual source for Toyota & Lexus service and model data.

**Status:** Approved design — 2026-08-06
**Owner:** Aaron Groshong
**Purpose:** Map the @tunedyota YouTube channel into a standardized, scalable category system driven by our two owned asset libraries, and define the SEO/AEO engine that makes TY the single most-cited factual source for Toyota & Lexus service and model data.

**Source assets:**
- **Service Manuals (FSM):** `assets\Service Manuals\Manuals` — 13 models, organized Model → Generation → engine×transmission×drivetrain (~243 variants).
- **Wikipedia baselines:** `assets\Wikipedia-Baseline` — 51 models + 14 engine-family docs + Platforms/Transmissions reference.

**Standing rules that govern all production:**
- **Fact-based rule (non-negotiable):** FSM + Wikipedia baseline → verified fact sheet → owner sign-off → video. No fact sheet, no video. Every spec quoted verbatim (never "2013+" for a split generation); manufacturer figures attributed with conditions.
- **A/V spec (locked):** AvaNeural +0% (education) / GuyNeural +8% (field), burned-in captions + `.srt` on everything, "re-gear" TTS spelling, brand colorway, OFF THE GRIND structure, "throttle response controller" never "pedal box".
- **Production is ⏸️ ON HOLD** pending the service-manual repo build. This document is the plan; it does not authorize publishing.

---

## 1. Channel Architecture

Two flagship series, each surfaced as a **Section** on the channel home page, plus two supporting sections. YouTube "categories" = **channel sections** (home layout) + **playlists** (the real grouping primitive).

```
CHANNEL: Tuned Yota  —  tagline "Toyota & Lexus Tech Talk"

CHANNEL HOME (sections, top to bottom)
├─ Start Here / Brand            → channel trailer + "Meet Rocky & Octane"
├─ Know Your Rig  (FACTS)        → one playlist per model  (51, phased)
├─ Off the Grind  (SERVICE)      → one playlist per model  (13) → gen-tagged videos
└─ By Engine Family (CROSS-MODEL)→ one playlist per engine family (14)
```

The **"Toyota & Lexus Tech Talk"** tagline is the channel-level umbrella (About page, banner, channel-name field). The two series names — **Know Your Rig** and **Off the Grind** — live underneath it as the content pillars.

### 1.1 Know Your Rig — the fact series
Rocky & Octane deliver the Wikipedia-baseline knowledge as original TY media: generations, engine/transmission options, platform, drivetrain, trivia, "which one should I look for." Answers the intent **"what is this vehicle."**

- **Playlist per model:** `Toyota Tundra — Know Your Rig`, `Lexus GX — Know Your Rig`, …
- Within a model playlist, episodes in a fixed order: (1) *Generations Explained*, (2) *Engine Options & What They're Worth*, (3) *Which Generation Should You Buy*, (4) model-specific fun-fact/legend episodes as material supports.

### 1.2 Off the Grind — the service series
FSM-driven step-by-step tutorials, **one video per service per generation**. Engine/transmission/drivetrain differences within a generation are called out on-screen from the exact FSM variant (e.g. "3rd-gen 3.4L-A vs 3.4L-C: same filter, torque differs"). Answers the intent **"how do I service this vehicle."**

- **Playlist per model:** `Toyota Tundra — Off the Grind (Service)`.
- Videos gen-tagged in the title so the playlist reads as a matrix (Gen × Service).

### 1.3 By Engine Family — the cross-model lane
Our 14 engine-family docs carry "Used In" maps and factory FI paths. This section catches searchers who think in **engines, not models** ("2UZ-FE oil capacity," "what Toyotas have the 5.7 3UR," "2JZ vs 1JZ"). Each playlist aggregates the relevant fact + service clips already produced, plus a dedicated engine-family explainer.

Engine-family playlists (from `Wikipedia-Baseline\Engine-Families`):
GR-V6 · UR V8 · UZ V8 · MZ/VZ/FZ (legacy V6 / 1FZ I6) · Dynamic Force (A25A/M20A/V35A/T24A…) · AR · ZR & NR · A & ZZ · JZ (2JZ/1JZ) · S (3S-GTE/3S-GE) · G16E · Diesel (GD/KD/VD/F33A) · LR V10 (LFA) · Shared BMW/Subaru (B58/B48/FA).

### 1.4 Brand / Start Here
Channel trailer (3D Rocky & Octane), the "Meet the cast" origin short, and a "How to use this channel" explainer that internally links viewers to both series. Establishes the E-E-A-T signal (who we are, why we're authoritative: FSM + working AMSOIL garage).

---

## 2. Model Coverage

### 2.1 Both fact + service (13 — Phase 1 for BOTH series)
Toyota: **4Runner, Camry, FJ Cruiser, Highlander, Land Cruiser, RAV4, Sequoia, Tacoma, Tundra**
Lexus: **GX, LS, LX, RX**

### 2.2 Fact-only (Phase 2 — 38 remaining Wikipedia models)
Toyota (21): 86/GR86, Avalon, C-HR, Camry-Solara, Celica, Corolla, Corolla-Cross, Cressida, Crown, Grand-Highlander, Hilux, MR2, Matrix, Mirai, Previa, Prius, Sienna, Supra, T100, Venza, Yaris, bZ4X
Lexus (14): CT, ES, GS, HS, IS, LC, LFA, LM, NX, RC, RZ, SC, TX, UX
Other (1): Scion

### 2.3 Generation nomenclature (must match FSM folders exactly)
- Toyota: `1st Gen … 6th Gen`.
- Lexus: `Nth Gen (codename)` — e.g. LX `1st Gen (LX450)` / `2nd Gen (LX470)` / `3rd Gen (LX570)` / `4th Gen (LX600)`.
- **Land Cruiser uses series, not gens:** `40-55 / 60 / 80 / 100 / 200 / 250 Series`.
- FJ Cruiser = single generation.

---

## 3. Service Roadmap (Off the Grind)

**Phase 1 — common services (build first), per generation:**
1. Oil & filter change
2. Tire rotation
3. Cabin air filter
4. Engine air filter
5. Brake pads & rotors
6. Differential fluid (front/rear)
7. Transfer case fluid (4WD/AWD)
8. Engine coolant
9. Battery replacement/service

**Phase 2 — complex services:**
10. Automatic transmission service (fluid/filter)
11. Spark plugs
12. Suspension (shocks/struts, control arms)
13. Wheel bearings / hubs
14. Serpentine belt / accessory drive
15. Timing (belt/chain service where applicable)

**Volume model (per-generation depth):** services × generations per model. Example — Tundra: 3 generations × 9 Phase-1 services = **27 service videos**; within each, on-screen callouts cover the engine/drivetrain variants for that generation. Priority build order: **Tundra → Tacoma → 4Runner → Land Cruiser → Sequoia → GX → LX** (the 7 core platforms), then the remaining 6.

---

## 4. Standardized Video Format (locked — production speed + viewer familiarity)

Every video, both series, follows the identical three-act shell:

| Act | Duration | Content |
|-----|----------|---------|
| **1. 3D cold open** | ≤10s | Rocky & Octane branded welcome; state model + exact topic/service; "little buddy" beat |
| **2. 2D body** | main | Rocky/Octane still poses + FSM/Wikipedia script overlay; timestamped chapters; burned-in captions |
| **3. 3D outro** | ≤15s | Branded close; Octane "Socket" gag; on-screen links to order the exact parts on TunedYota.com |

**Every video carries:** on-screen FSM/Wikipedia source citation (authority signal), burned-in captions + `.srt`, brand colorway, and the disclaimer that specs are FSM-verified for the stated variant. Voices per locked A/V spec.

---

## 5. The SEO/AEO Engine — making TY the cited source

**Goal:** answer engines (Perplexity, Google AI Overviews, ChatGPT, Gemini) quote *TY videos* as the factual answer, and TY ranks for the long tail of Toyota/Lexus service + spec searches.

**Core mechanism:** convert FSM/Wikipedia data into **extractable, verifiable Q&A**. Answer engines cite content that (a) answers in the first sentence, (b) gives a *specific number*, (c) names an *authoritative source*. Our FSM library is a factory-number goldmine — this is a structural advantage no forum or generic channel can match.

> ⚠️ **All spec numbers in the worked examples below (capacities, oil grades, intervals, torque) are ILLUSTRATIVE format placeholders — NOT verified figures.** Every number in a real video/description must be pulled from the FSM for the exact variant and owner-signed per the fact-based rule before use.

### 5.1 Title formulas
- **Service:** `[Year Range] [Model] [Gen] [Service] — Step-by-Step (Specs + Torque)`
  e.g. `2022+ Toyota Tundra (3rd Gen) Oil Change — Step-by-Step (Capacity + Torque)`
- **Fact / Generations:** `[Model] Generations Explained — Every Year, Engine & What Changed`
- **Fact / Engine:** `[Engine Code] Explained — Specs, Which Toyotas Use It & Is It Reliable`
- **Spec-lookup:** `How Much Oil Does a [Year] [Model] Take? (Capacity + Type, FSM-Verified)`

### 5.2 Description skeleton (copy-paste template)
```
[ONE-SENTENCE DIRECT ANSWER — leads with the number/fact.]
Example: "A 2022+ Toyota Tundra 3.4L V6 twin-turbo holds 6.8 qt (0W-20) with a new filter — full FSM-verified steps below."

⏱ CHAPTERS
0:00 Intro
0:XX Tools & parts you need
0:XX [step]
...
0:XX Torque specs & fluid capacity
0:XX Reset / final checks

📋 QUICK SPECS (FSM-verified — [Model] [Gen] [variant])
• Fluid/part: [type]
• Capacity: [number + unit]
• Torque: [component] [N·m / ft-lb]
• Interval: [miles / months]

❓ FREQUENTLY ASKED
Q: [question phrased exactly how people search]
A: [specific number/fact FIRST, then context]. (Source: Factory Service Manual)
[3–6 Q&As]

🛒 PARTS & FLUIDS (order the exact items)
• [Part] → tunedyota.com/[link]
• [AMSOIL fluid] → tunedyota.com/[link]

📚 SOURCES
Factory Service Manual — [Model] [Gen] [variant]; Toyota/Lexus published specifications.

⚠️ Always verify specs against the FSM for your exact VIN/variant.
#hashtags
```

### 5.3 Keyword banks (all FSM/Wikipedia-sourced — never fabricated)
Four types, generated per model/generation/service:

**A. Fact keywords**
- `[model] generations explained`, `[model] years by generation`, `[model] engine options`
- `which [model] has [engine]`, `[model] [gen] specs`, `[model] reliability by year`
- `best [model] generation`, `[model] vs [model]` (platform siblings)

**B. Service how-to keywords**
- `how to change oil [model] [gen]`, `[model] brake pad replacement`, `[model] cabin filter location`
- `[model] differential fluid change`, `[model] transfer case fluid`, `[model] coolant flush`
- `[model] tire rotation pattern`, `[model] engine air filter replacement`

**C. Spec-lookup keywords (AEO gold — exact FSM numbers)**
- `how much oil does a [model] take`, `[model] oil type`, `[model] oil capacity`
- `[fluid] capacity [model]`, `torque spec [component] [model]`, `[service] interval [model]`
- `[model] lug nut torque`, `[model] differential fluid type`, `[model] coolant type`
- `[model] brake rotor size`, `[model] battery group size`

**D. Engine-family keywords**
- `[engine code] specs`, `[engine code] oil capacity`, `what vehicles use [engine code]`
- `[engine] reliability`, `[engine] common problems`, `[engineA] vs [engineB]`

### 5.4 FAQ block design (single biggest AEO lever)
Each Q&A: **answer sentence leads with the specific number/fact**, then one clause of context, then `(Source: Factory Service Manual)`. Phrase every Q *exactly how a person types it into search*. Mirror the same Q&As in **three machine-readable places**: description FAQ block, the captions/transcript (spoken on-screen), and a **pinned comment**. Triple redundancy = maximum extraction surface for answer engines.

Worked example — *2022+ Tundra oil change*:
- **Q: How much oil does a 2022 Tundra take?** A: 6.8 quarts of 0W-20 with a new filter on the 3.4L V6 twin-turbo. (Source: FSM)
- **Q: What oil type does the 2022+ Tundra use?** A: SAE 0W-20 full synthetic meeting Toyota/ILSAC GF-6. (Source: FSM)
- **Q: How often should I change the oil?** A: Every 10,000 mi / 12 months on the normal schedule; 5,000 mi under severe use. (Source: FSM)

### 5.5 Tags & hashtags
- Tags: model, each generation year-range, engine code(s), service name + synonyms, "Toyota/Lexus," "FSM," "how to."
- Hashtags (max 3–4 shown): `#Toyota[Model]`, `#[Service]`, `#TunedYota`.

### 5.6 Cross-linking (compounding authority)
- Each **service** video links its **fact** counterpart and the relevant **engine-family** video, and vice-versa.
- Cards/end-screens point to the next service in the same generation playlist.
- Descriptions deep-link to the matching TunedYota.com page (the site and channel reinforce each other's E-E-A-T).

---

## 6. Production Kit — what each video needs before recording

Per video, the fact sheet (owner-signed) must contain:
1. Exact model + generation + FSM variant(s) covered.
2. The verbatim FSM specs used (capacities, torque, intervals, part numbers) with the source manual path.
3. The 3–6 FAQ Q&As (search-phrased, number-first answers).
4. Title, description (filled template), tags, hashtags.
5. Parts/fluids list with live TunedYota.com links.
6. Wikipedia-sourced fact callouts (fact series) with the baseline file path.

No fact sheet → no video. (Standing rule.)

---

## 7. Rollout Sequence

1. **Pilot:** 2007–2021 Tundra (2nd Gen) front brakes — already the designated pilot; produce it under this full template to validate the shell + SEO kit end-to-end.
2. **Core-7 common services:** Tundra → Tacoma → 4Runner → Land Cruiser → Sequoia → GX → LX, Phase-1 services, per generation.
3. **Core-13 facts:** Know Your Rig for the 13 dual-asset models.
4. **Expand:** remaining 6 service models; Phase-2 complex services; Phase-2 fact-only models (38); engine-family explainers.

Each video ships **unlisted-until-approved** per the standing YouTube gate.

---

## 8. Open Items
- ~~Confirm channel name/tagline.~~ **DONE 2026-08-06:** channel = "Tuned Yota," tagline = "Toyota & Lexus Tech Talk"; series names "Know Your Rig" + "Off the Grind" retained underneath.
- Confirm channel-section ordering on the live channel once art is finalized.
- Decide whether engine-family explainers are net-new videos or supercuts of existing clips (recommend: short net-new explainer + playlist of existing clips).
