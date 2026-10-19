# Deployment & team-use roadmap

_Saved 2026-10-18 for later. Nothing here is implemented yet._

## Chosen now: path D
Publish as a static web app; all data stays in each browser (IndexedDB). No company data leaves the machine.
Move data between machines with Export / Import (JSON). First publish = **1.0.0**.

Versioning: major `2.0.0` (data format / way of working changes), minor `1.1.0` (new features), patch `1.0.1` (fixes).
Pre-publish history is written as minor versions `0.1.0` … `0.18.0` in `CHANGELOG.md`
(git had no commits before that, so earlier code can only be described, not restored).

## Data is confidential — ask IT first
1. Data classification (Internal / Confidential / Restricted)?
2. Which cloud does the company use, and may internal web apps be deployed there?
3. Must users sign in with company accounts (SSO)?
4. Data residency / region requirements?
5. Who maintains the system (support, backups, updates)?

## Options when a team needs it

| Option | How | Needs IT | Simultaneous use | Overwrite risk |
|---|---|---|---|---|
| 1. Send JSON files | export → import | no | no | high (import replaces all) |
| 2. Shared JSON on OneDrive/SharePoint/Drive | File System Access API on a synced file | no | one editor at a time | medium |
| 3. Microsoft 365 / Google Workspace as backend | SharePoint Lists (Graph) or Sheets, SSO | small (app registration) | yes | low |
| 4. Own backend + DB + SSO (company cloud or on-prem) | API + PostgreSQL | yes | yes, realtime possible | lowest |

Not recommended: peer-to-peer sync; unapproved third-party cloud for confidential data.

Suggested path: D now → option 3 for a small team (if the company uses M365/Google), else option 2 → option 4 as release **2.0.0**.

## App changes needed for any team option
- Real users: In-charge picked from a user list.
- Split team data (projects, tasks, milestones) from personal data (today, highlights, routines, timers).
- Save per record instead of rewriting the whole dataset (current `DexieRepository.save` clears and rewrites).
- `updatedAt` / `updatedBy` on every record (conflicts, history).
- Permissions per project; audit log; automatic backups.
- Reminders while the app is closed need server-side notifications (Teams / email).

The `Repository` interface (`src/data/repository.ts`) is the swap point; the UI does not need to change.

## Status (2026-10-19)

Option 2 (shared OneDrive / Box folder) is implemented as **team mode in 2.0.0**: one file per person,
field-level merge, conflict alerts with a choice of value, edit history, deleted-items list, and
non-blocking editing notices. Option 3 (Microsoft 365 / SharePoint via Graph) is the next step once
team mode has proven itself; it would replace `src/team/folder.ts` + the file merge with a real
server-side check, keeping the same UI.
