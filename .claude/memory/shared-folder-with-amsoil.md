---
name: shared-folder-with-amsoil
description: This repo folder is SHARED with a separate AMSOIL project/session — check the branch before committing; use a master worktree to avoid landing Tuned Yota commits on amsoil-garage
metadata: 
  node_type: memory
  type: feedback
  originSessionId: fac83f77-352e-4aae-8c26-59e564d408f3
---

The working directory `C:\Users\grosh\Documents\tunedyota` is **shared between two concurrent
Claude sessions/projects**: Tuned Yota (this one) and a separate **AMSOIL Garage** project (owner
confirmed 2026-07-09, running it deliberately). A git working dir can only be on one branch at a
time, so the sessions collide: on 2026-07-09 the AMSOIL session checked the folder out to a branch
`amsoil-garage`, and a Tuned Yota commit (the app privacy policy) silently landed there instead of
`master` — `git push origin master` then reported "up-to-date" and the change never deployed.

**Why:** Tuned Yota deploys via `git push origin master`, but the shared folder may be on
`amsoil-garage` (or another branch) when I go to commit.

**How to apply — before ANY Tuned Yota commit/push in this folder:**
1. `git branch --show-current` — if it's NOT `master`, do NOT commit directly (you'd land on the
   other project's branch and it won't deploy).
2. Land the change on master WITHOUT switching the shared dir's branch (that would disrupt the
   AMSOIL session's files): commit where you are, then use a **temp worktree** —
   `git worktree add /c/Users/grosh/Documents/_ty_master_fix master` →
   `git -C /c/Users/grosh/Documents/_ty_master_fix cherry-pick <sha>` →
   `git -C … push origin master` → `git worktree remove …`.
3. Verify the deploy (`curl` the changed URL) — "up-to-date" on push is the tell-tale that the
   commit went to the wrong branch.

**Better fix (recommend to owner):** run each project in its OWN folder (separate clone/worktree)
so the two sessions stop sharing one checkout. Until then, treat every commit here with the
branch-check above. (This may become stale if the owner separates the folders — re-verify.)
