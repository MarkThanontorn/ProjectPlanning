# Project Planning

WebApp สำหรับติดตามงาน (WBS · Gantt · Kanban/Eisenhower · Kanban สถานะ · รายการงาน) ตาม Wireframe `Planing App.pdf`

## เริ่มใช้งาน
```bash
npm install
npm run dev      # http://localhost:5190
npm run test     # unit tests ของ logic คำนวณ
npm run build
```

## โครงสร้าง
- `src/domain` – types, การคำนวณ Leadtime / Rollup / Timer (`calc.ts`), ช่วงสัปดาห์ (`week.ts`)
- `src/data` – `Repository` interface + `DexieRepository` (IndexedDB) + ข้อมูลตัวอย่าง
- `src/store` – Zustand store ที่ทุกหน้าจอใช้ร่วมกัน
- `src/views` – wbs, gantt, board (Eisenhower / Status), list
- `src/i18n` – ภาษาไทย / อังกฤษ

ข้อมูลเก็บใน IndexedDB ของเบราว์เซอร์ — ใช้ปุ่ม Export/Import ที่แถบซ้ายเพื่อสำรองข้อมูล
ถ้าจะต่อ Backend ภายหลัง ให้เขียน class ใหม่ที่ implement `Repository` แล้วสลับใน `src/store/useAppStore.ts`

## Team mode (2.0.0)

Shares one plan between a few people through a folder synced by OneDrive / Box — no server.

- `src/team/model.ts` — every change is an op that sets one field of one record. Ops list the
  ops they replaced (`seen`); a field whose newest ops didn't see each other is a conflict.
- `src/team/client.ts` — one member's ops plus everyone else's files; resolve / restore; file formats.
- `src/team/folder.ts` — File System Access API (Edge / Chrome). In dev, "Try with a test folder"
  uses the browser's private file system instead of a real folder.
- `src/team/teamStore.ts` — glue to the app store: sync loop, editing locks, notifications.
- Folder contents: `<name>-<id>.data.json` (that person's ops) and `<name>-<id>.live.json`
  (presence + what they're editing). Personal data (Today list, routines, settings, collapsed rows)
  is never written there.

## Publishing
- **Website:** every push to `master` builds and deploys to GitHub Pages
  (`.github/workflows/deploy.yml`) → `https://markthanontorn.github.io/ProjectPlanning/`.
- **Single-file app:** pushing a version tag (`vX.Y.Z`) attaches `ProjectPlanning-vX.Y.Z.html`
  to a GitHub Release (`.github/workflows/release.yml`). Open it in Edge/Chrome — no install needed.
  Build it locally with `npm run build:single` → `dist-single/index.html`.
- Data always stays in the browser that uses the app. The website and the single file keep
  separate data; move it with Export → Backup (.json) and Import.

## Versions & releases
Current version: see `package.json` (also shown at the bottom of the sidebar → "What's new").
Every release is listed in [`CHANGELOG.md`](CHANGELOG.md).

- **Major** `2.0.0` — data format or way-of-working changes
- **Minor** `1.1.0` — new features
- **Patch** `1.0.1` — fixes / small visual tweaks

Release steps:
1. Add the changes under a new version heading in `CHANGELOG.md` (English — this is what GitHub shows),
   and the same entry in Thai in `src/i18n/changelog.th.md` (shown in the app).
2. Bump `"version"` in `package.json` to match.
3. `npm run test && npm run build`
4. `git commit`, tag it (`git tag -a vX.Y.Z -m "vX.Y.Z"`) and push both: `git push && git push --tags`

Plans for publishing and team use: [`docs/TEAM-ROADMAP.md`](docs/TEAM-ROADMAP.md).
