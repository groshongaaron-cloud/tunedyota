---
name: installer-console-access
description: How installers log in to /installer.html and where the passcodes live (Netlify INSTALLER_TOKENS) — NO secret values stored here; memory mirrors to git.
metadata: 
  node_type: memory
  type: reference
  originSessionId: 5dc65e6b-44f7-4e23-afad-16cc858aa763
---

**⚠️ Never write the actual passcodes into memory** — the memory dir mirrors to git and pushes to GitHub, so any value here = a permanent leaked secret in history (see [[pending-secret-rotation]]). Route passcodes via the clipboard, never the chat/repo.

**Login flow.** `/installer.html` has one **passcode** field → saved in the browser's `localStorage` as `ty_installer_token` → sent as the `x-installer-token` header on every roster/close-out call. Server `lib/installer-auth.js` `resolveInstaller` matches it against the **`INSTALLER_TOKENS`** Netlify env var (JSON map `{"aaron","noah","cody"}`, fail-closed). A valid token scopes the installer to only their own bookings; wrong/missing → 401 → the page clears the stored token and reloads. Set 2026-07-01; as of 2026-07-04 all three are set, each a random **12-char** passcode (owner didn't pick them → doesn't recognize them; that's expected).

**Source of truth = Netlify.** Don't store the values anywhere else — retrieve on demand and drop on the clipboard (owner pastes into the field). Keys only, no leak:
`netlify env:get INSTALLER_TOKENS | node -e '…JSON.parse→Object.keys…'`. To hand the owner one passcode: read INSTALLER_TOKENS in **PowerShell**, `ConvertFrom-Json`, `Set-Clipboard -Value $m.aaron` — print only a length/confirmation, never the value.

**Rotation / reset** (if leaked, or to set a memorable one): `netlify env:set INSTALLER_TOKENS '{"aaron":"…","noah":"…","cody":"…"}'` + redeploy; that instantly invalidates the old token on every device. Capture the owner's chosen value from the clipboard (`Get-Clipboard`), never from chat. For the durable copy the owner wants for "easy reference," the right home is their **password manager**, not memory/git. Related console details: [[event-reminders-automation]].
