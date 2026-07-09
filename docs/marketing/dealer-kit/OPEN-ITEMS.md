# Dealer Kit — Open Items (owner input)

What's left before the Dealer Partner Kit can be sent to a dealer. Everything else
(templates, contacts, pre-filled outreach drafts) is done. Update this as data arrives,
then fill the token and run `npm run render:dealer-kit` to regenerate the PDFs.

Status: **opened 2026-07-09** — waiting on owner data.

## A. Proposed fills — awaiting owner OK (low-risk, grounded)
Claude proposed values; confirm or edit, then Claude writes them in.
- [ ] **Contact / rep sign-off** (`00-cover.html`, `03-process-logistics.html`) — proposed: `Tuned Yota · (612) 406-7117 · info@tunedyota.com`. Owner: confirm, or give a specific person + direct line.
- [ ] **Typical turnaround** (`03-process-logistics.html`) — proposed: "Most OTT calibrations completed same day at your regional event; custom/supercharger builds dialed in over several sessions." Owner: confirm/edit.
- [ ] **Where work happens** (`03-process-logistics.html`) — proposed: "at scheduled Tuned Yota tuning events across your region (supercharger kits drop-ship and are installed by our team)." Owner: confirm/edit the service model.

## B. Owner decisions — Claude cannot supply (economics)
No basis to propose; these are business calls only the owner can make.
- [ ] **Tier-1 referral fee / revenue share** (`03-process-logistics.html`) — $ per referred tune, % , or tiers?
- [ ] **Tier-2 F&I menu rev-share** (`03-process-logistics.html`) — the split when placed on the dealer's F&I menu.
- [ ] **Payment flow** (`03-process-logistics.html`) — how & when the dealer is paid (per job / monthly check / net-30 / etc.).

## C. Legal / documents — owner supplies the real thing, counsel gates it
Must not be drafted or paraphrased.
- [ ] **OTT warranty/support terms** (`02-warranty-magnuson-moss.html`) — reproduce OTT's **actual written** calibration-warranty language *verbatim*. Owner pastes real text / points to OTT's doc.
- [ ] **COI** (`00-cover.html`) — owner's certificate of insurance; owner provides/attaches the file.

## D. Counsel review (blocks distribution regardless of tokens)
- [ ] **`01-compliance-statement.html`** — counsel sign-off (currently DRAFT watermark).
- [ ] **`02-warranty-magnuson-moss.html`** — counsel sign-off (currently DRAFT watermark; also needs item C-OTT text first).

---

**Close-out per item:** fill the token in the named file → `npm run render:dealer-kit` → PDFs land in
`assets-source/dealer-kit-exports/`. When A–C are filled and D is signed off, remove the `.draft`
class from artifacts 01/02 and the kit is distribution-ready.

Related: `outreach-templates.md` · `tier-a-contacts.md` · `tier-a-outreach-filled.md` (all done).
