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
1. Add the changes under a new version heading in `CHANGELOG.md`.
2. Bump `"version"` in `package.json` to match.
3. `npm run test && npm run build`
4. `git commit`, tag it (`git tag -a vX.Y.Z -m "vX.Y.Z"`) and push both: `git push && git push --tags`

Plans for publishing and team use: [`docs/TEAM-ROADMAP.md`](docs/TEAM-ROADMAP.md).
