# Rocky — Concept & Turnaround Prompt Pack

**For:** AI image / 3D concept tool operator
**Status:** Ready to paste — use these to generate initial Rocky concepts for owner review
**Related brief:** `docs/brand/rocky/character-brief.md`

---

## How to Use This Pack

1. Paste one prompt at a time into your image/3D concept tool.
2. Generate several variations per prompt.
3. Present a shortlist (3–5 candidates) to the owner for a single pick.
4. **Once the owner approves one concept, that image becomes the canonical Rocky reference.**
5. All subsequent work (turnaround, poses, expressions, episode renders) derives from that single approved reference — do not re-prompt from scratch. See the Consistency Approach section below.

---

## Concept Prompts

### Prompt 1 — Front View, Character Establish

```
Stylized 3D rendered red fox character, calm and confident expression, standing straight in a neutral pose. Body fur color is a muted gray-green similar to Toyota Lunar Rock paint — not orange, not gray, not tan. Ear insides and tail tip are warm orange. Off-white belly. Wearing a shop technician's apron with a small logo patch on the chest, and a forward-facing baseball cap with fox ears poking through the sides. Holding a torque wrench loosely in one hand. Studio lighting, soft key from upper-left, slight fill from right. Pixar-like quality but grounded and professional. White or transparent background. Front-facing hero shot.
```

### Prompt 2 — 3/4 View, Confident Mentor

```
Stylized 3D fox character, 3/4 front-left view, slight tilt of the head as if mid-explanation. Muted gray-green fur body (Toyota Lunar Rock palette), warm orange accent on ear insides and tail tip, off-white chest. Shop apron over a t-shirt, forward baseball cap. One arm slightly extended as if gesturing toward an off-camera diagram. Calm, precise expression — not smiling widely, more of a focused-friendly look. Pixar-quality 3D render, clean studio background. Professional mascot, not a children's cartoon.
```

### Prompt 3 — Explaining Pose, Tight Upper Body

```
Tight upper-body shot of a stylized 3D fox mascot in mid-explanation. Chest-up framing, slight lean forward, eyebrows in a focused but approachable position, eyes directed at viewer. Muted gray-green Lunar Rock body fur, orange ear insides visible. TY shop shirt or apron, forward baseball cap. Hand or paw lightly raised as if making a point. Warm studio lighting, slight rim light to define the silhouette. Clean background. 3D render quality between Pixar and modern game cinematic — no cartoon exaggeration.
```

### Prompt 4 — Full Body, A-Pose Turnaround Ready

```
Full body stylized 3D fox character, neutral A-pose — arms relaxed at sides, torque wrench held loosely in right hand at hip, tail gently curved behind. Muted gray-green body fur (Lunar Rock tone), warm orange ear insides and tail tip, off-white belly. Shop apron + TY baseball cap. Face forward, neutral-friendly expression, ears perked. Even, neutral lighting suitable for a turnaround sheet — no dramatic shadows, visible from all angles. White background. Clean silhouette. Character design brief: master-tech mentor fox, professional not goofy.
```

### Prompt 5 — Phone-Format Vertical Crop

```
Vertical 9:16 crop, stylized 3D fox technician from chest up against a clean dark workshop background. Muted gray-green Lunar Rock fur body, orange ear insides, off-white chest. Shop apron with a chest patch, forward baseball cap. Explain expression — focused brow, slight head tilt, holding a torque wrench near chest height. Warm key light from upper-left, subtle rim light on right edge. 3D render, Pixar-quality. The character should read clearly and expressively at small phone screen size — no busy details that vanish at scale.
```

---

## Consistency Approach

**Lock one canonical concept. Never re-prompt from scratch.**

After the owner reviews the concept shortlist and picks one:

1. Save the approved image as `assets/rocky/canonical-concept-v1.[ext]` and commit it to the repo.
2. All turnaround views (front, back, left, right, 3/4) must derive from that single approved concept as the visual reference. Use "same character as reference image" or equivalent consistency controls in your tool.
3. All expression sheet faces must derive from the same approved concept.
4. All episode animation references the locked rigged model — not new concept generations.
5. If a future episode requires a new prop or wardrobe swap, the base character reference does not change — only the prop in the hand or the apron variant.

**Why this matters:** Rocky's entire value as a mascot depends on being immediately recognizable across all 148+ episodes. Regenerating from a prompt introduces drift. The locked canonical concept + locked rig is what keeps Rocky on-model across years of content.

---

## Do-Not List

These apply to every Rocky concept, render, pose, and episode asset. No exceptions.

- **Do not reproduce a verbatim likeness of any real person.** Rocky is an original stylized fox character.
- **Do not reproduce a verbatim likeness of any existing mascot** (Firefox, Fantastic Mr. Fox, Zootopia characters, Arby's Oven Mitt, etc.). Rocky is an original design.
- **Do not use an orange body.** The Lunar Rock 6X3 body color is gray-green. Orange appears on ear insides and tail tip only. A Rocky with an orange body is off-model and breaks the brand logic.
- **Do not make Rocky look goofy, clumsy, or wide-eyed.** The personality is calm master-tech mentor. Avoid exaggerated surprised expressions, slapstick poses, or anything that reads as incompetent.
- **Do not invent wardrobe.** Rocky wears a TY shop shirt/apron and TY cap. No other clothing, accessories, or costume elements unless explicitly approved by the owner for a specific episode.
- **Do not use any color not in the locked palette** for the character body or accents. Colors outside the palette may appear in background set dressing or UI elements, not on Rocky.
- **Do not render Rocky with human hands.** Stylized paws consistent with the character design — the tool props work with a stylized grip.
