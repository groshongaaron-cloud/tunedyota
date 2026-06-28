#!/usr/bin/env node
// Mirror Claude Code's project memory into the repo (.claude/memory/) and, if anything
// changed, commit + push just that folder. Wired to the SessionEnd hook so the repo copy
// never drifts. Best-effort: any failure is swallowed so it never blocks session end.
//
//   node scripts/mirror-memory.cjs
//
// The live memory lives outside git at ~/.claude/projects/<project>/memory/. Override the
// source with MEM_DIR=... if the path differs on another machine.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const REPO = path.resolve(__dirname, "..");
const SRC =
  process.env.MEM_DIR ||
  "C:/Users/grosh/.claude/projects/C--Users-grosh-Documents-tunedyota/memory";
const DST = path.join(REPO, ".claude", "memory");

try {
  if (!fs.existsSync(SRC)) process.exit(0); // nothing to mirror on this machine
  fs.mkdirSync(DST, { recursive: true });
  for (const f of fs.readdirSync(SRC).filter((f) => f.endsWith(".md"))) {
    fs.copyFileSync(path.join(SRC, f), path.join(DST, f));
  }
  const git = (cmd) => execSync(`git ${cmd}`, { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  git("add .claude/memory");
  const changed = git("diff --cached --name-only -- .claude/memory");
  if (changed) {
    // Commit ONLY the memory folder, so unrelated staged/working changes are untouched.
    git('commit -q -m "chore(memory): auto-mirror on session end" -- .claude/memory');
    try { git("push -q origin HEAD"); } catch (_) { /* offline / push blocked — commit still local */ }
    console.log("mirrored + committed:\n" + changed);
  } else {
    console.log("memory mirror already up to date");
  }
} catch (_) {
  // Never block session end on a mirror failure.
  process.exit(0);
}
