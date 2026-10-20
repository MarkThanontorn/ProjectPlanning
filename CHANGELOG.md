# Changelog

All notable changes to Project Planning. Versions follow `MAJOR.MINOR.PATCH`:

- **Major** (`2.0.0`) — changes to the data format or the way the app is used
- **Minor** (`1.1.0`) — new features
- **Patch** (`1.0.1`) — fixes and small visual tweaks

Versions before 1.0.0 were reconstructed after the fact from the development history
(dates are approximate). Only 1.0.0 onward exists in git, so earlier versions can be
read about here but not checked out.

## [2.0.1] — 2026-10-20
Security hardening.
- Team mode checks every teammate file before using it: malformed entries are skipped,
  values are cleaned to the right type, and entries claiming to come from someone else are ignored.
  A damaged file in the team folder can no longer crash the app for everyone.
- Imported .json backups go through the same checks.
- CSV export: text starting with `=`, `+`, `-` or `@` is kept as text, so it can't run as a
  spreadsheet formula when opened in Excel.
- Content Security Policy on the web app and the single-file app: the app can only load its own
  code, styles and fonts, and can't send data to any other site.
- The font (IBM Plex Sans Thai) is now part of the app instead of loading from Google Fonts —
  after loading, the app makes no internet requests at all.

## [2.0.0] — 2026-10-19
Team mode: 2–3 people share one plan through a OneDrive / Box folder — no server needed.
- Join from the sidebar ("Team mode") or the welcome screen: enter your name and pick the
  shared folder (Edge / Chrome). The first person's data becomes the team's starting data;
  people joining later can use the team's data or merge theirs in (a .json backup is downloaded first).
- Each person writes only their own file in the folder; the app merges everyone's changes
  field by field, so edits to different fields of the same task never overwrite each other.
- "Sync" button, plus automatic sync every minute and when you return to the tab.
  The sidebar lists members, when each last saved, and who is online.
- Conflicts: when two people change the same field without seeing each other's change, both
  are notified and shown each value with who set it and when; anyone picks the value to keep.
  The newest value is shown until then. Delete-vs-edit is handled the same way (the item stays until decided).
- Edit history per task (who changed what, when) with "Use this" to put an earlier value back.
- Deleted items: a list of everything deleted in the team, restorable together with what was deleted with it.
- Editing notice: while someone edits a task in its popup, others see "🔒 … is editing this task"
  (also next to the name in WBS), can ask to be notified when they're done, and are never blocked.
  Locks expire on their own (no heartbeat for 5 minutes, or 10 minutes without typing).
- Personal things stay personal: your Today list, highlights, routines, collapsed rows and settings.
- Leaving team mode keeps the latest data on this computer.

## [1.1.1] — 2026-10-18
- Asks the browser for persistent storage, so data isn't evicted when disk space runs low;
  the sidebar shows whether it was granted and when the last backup was made.
- Backup reminder: a banner after 7 days without a JSON backup (or since first use),
  with "Back up now" and "Remind me tomorrow". Only shown when there is real (non-sample) data.

## [1.1.0] — 2026-10-18
- First launch shows a welcome screen: start empty, or explore with sample data.
- Sample data is tagged; a banner offers "Remove sample data", which keeps your own items.
- "Delete all data / start over" link in the sidebar (settings, theme, team name and columns stay).

## [1.0.1] — 2026-10-18
- "What's new" follows the app language (Thai or English) and can be switched in the dialog.
  `CHANGELOG.md` stays English-only; the Thai copy lives in `src/i18n/changelog.th.md`.

## [1.0.0] — 2026-10-18
First published release. Everything below, plus:
- Version number shown in the sidebar, with this changelog under "What's new".
- Hosted on GitHub Pages (deployed automatically on every push).
- Single-file version (one `.html` file) attached to each GitHub Release, for computers
  that can't reach the hosted site.
- Page links now use `#/…` so refreshing works on static hosting and from a local file.

## [0.19.0] — 2026-10-18
- Dark mode: light / dark / follow system.
- Same-size progress bars for tasks, groups and projects.
- Drag to reorder the sidebar menu; the first item becomes the home page.
- Team name under the app name (also in the browser tab title).
- New page headers: menu icon, title and a one-line description.

## [0.18.0] — 2026-10-18
- WBS: drag a column edge to resize (double-click to reset); widths are remembered.
- WBS: row actions float over the row on hover, so names show in full.

## [0.17.0] — 2026-10-18
- Mark projects and groups complete (struck through) and reopen them.
- "Hide completed" in WBS and Gantt, the Task List filter and the board's "All" column.
- Routine reminders at set times (in-app card, plus a system notification when allowed).
- Reminder times are added with an explicit "+ Add time" step.

## [0.16.0] — 2026-10-18
- Daily routines repeat every day, on weekdays, on chosen days or monthly.
- Smaller pencil cursor.
- Filters in the board's "All" column (project, status, rank, in-charge, Plan End, not on this day yet, overdue).

## [0.15.0] — 2026-10-16
- The Today page moved into the boards' day column: highlights, compact task rows,
  task picker, routines, done list, day navigation; the "All" column can collapse.

## [0.14.0] — 2026-10-16
- Task List: filters for every column (multi-select, date and number ranges, overdue only).
- Task List: header sort cycles ascending → descending → none; clear-filter button.

## [0.13.0] — 2026-10-16
- Pencil cursor on renameable names.
- WBS: pin columns next to Name.
- Export to Excel (WBS, Tasks, Milestones, Time Logs sheets) and CSV.
- Fixed: JSON backups left out milestones and Today data.

## [0.12.0] — 2026-10-16
- Gantt: delete and rename items directly; scroll bars always on screen; sticky header.

## [0.11.0] — 2026-10-16
- Gantt: click an empty slot to zoom in (Year → Quarter → Week → Day).
- Gantt day view: click to create a task on that date.

## [0.10.0] — 2026-10-16
- Gantt extends beyond the plan by scrolling to either edge.
- Faster Gantt: only the visible part of the timeline is drawn.
- Milestone names always shown on the Gantt.

## [0.9.0] — 2026-10-15
- Edit a project's milestones from the Gantt; drag a milestone to change its date.

## [0.8.0] — 2026-10-15
- Sidebar timer card always visible (running, paused or idle).
- Master Plan page with milestones per project.
- Add projects, groups and tasks from the Gantt.

## [0.7.0] — 2026-10-14
- Progress slider that snaps to 0 / 5 / 25 / 50 / 75 / 95 / 100 %.
- Warning when more than 7 tasks are In Progress.

## [0.6.0] — 2026-10-14
- Done tasks struck through in WBS; progress steps; focus warning above 7 open tasks.
- Gantt: drag from one bar to another to link tasks.

## [0.5.0] — 2026-10-14
- Gantt: day / week / month / quarter / year scales.
- Task dependencies (finish-to-start), blocked tasks can't start, conflicts shown in red.
- Urgency from remaining work + 25 % buffer vs. time left to Plan End.
- Reminder to plan ~50 % extra time; "Strategy is choosing what not to do".

## [0.4.0] — 2026-10-14
- Manual Leadtime (hours or days).
- Automatic Eisenhower placement (Rank and Plan End) with manual overrides.
- Fixed-height, scrollable Eisenhower matrix.
- Today page (highlights, routines, day planning); running-timer card in the sidebar.

## [0.3.0] — 2026-10-13
- WBS: clearer add-task / add-group buttons inside each project and group row.

## [0.2.0] — 2026-10-13
- WBS: drag and drop tasks, groups and projects.

## [0.1.0] — 2026-10-13
- First build from the wireframe: WBS tree with roll-ups, Gantt chart, Kanban
  (Eisenhower and status), task detail with timer and checklist, Task List,
  Thai / English, local storage in the browser, JSON export / import.
