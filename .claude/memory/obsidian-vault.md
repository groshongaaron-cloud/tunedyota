---
name: obsidian-vault
description: "The user's Obsidian vault — location, structure, and how it was configured"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 3b2c096f-49f5-48c4-8389-d1a40e015e71
---

User's Obsidian vault: **`C:\Users\grosh\Documents\ObsidianVault`** (created fresh 2026-07-01). Separate from the tunedyota project repo.

Structure: `Home.md` (dashboard MOC) + folders `Notes/` (default new-note location), `Projects/`, `Daily/` (`YYYY-MM-DD`), `Templates/` (Daily Note / Meeting Note / Project templates), `Attachments/`. Config in `.obsidian/`: `app.json` (attachments→Attachments, new notes→Notes), `daily-notes.json` (folder Daily, template Templates/Daily Note Template), `templates.json` (folder Templates). Deliberately did NOT write `core-plugins.json` (its format churns across Obsidian versions; daily-notes + templates are on by default).

The **`obsidian-skills`** plugin is installed (skills: `obsidian:obsidian-cli`, `obsidian-markdown`, `obsidian-bases`, `json-canvas`, `defuddle`). Note: `obsidian:obsidian-cli` needs the Obsidian app OPEN with its CLI on PATH (was NOT on PATH here) — for file-level work (notes, `.base`, `.canvas`, config) operate on the vault folder directly instead. Templates use CORE Templates plugin syntax only (`{{title}}`, `{{date:FMT}}`, `{{time}}`) — NOT Templater date math (`{{date-1d}}`), which renders literally under the core plugin.
