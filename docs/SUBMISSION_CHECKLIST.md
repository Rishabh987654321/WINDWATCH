# SUBMISSION_CHECKLIST.md

From the brief (§3). Evaluation **starts with the video** — don't submit without it.

## Deliverables
- [ ] **Video** (unlisted YouTube, ≤ 10 min total; Part 1 customer ≤ 5 min, Part 2 tech review ≤ 5 min) — see `VIDEO_SCRIPT.md`
- [ ] **Public GitHub repo** with an **anonymous random name** (e.g. `kjhwr`)
  - [ ] README includes: **files & directories**, **how to start the app**, **link to the Vercel/Heroku app**, **AI-tools disclosure**
  - [ ] No personal info in repo or git history (author email = GitHub noreply; no real name in files)
  - [ ] Snapshot + manifest committed; CI green on `main`
- [ ] **Deployed app** on Vercel (or Heroku), uses Docker-built code path verified locally
- [ ] **Submission form** (Full Stack SWE challenge submission v4): https://forms.cloud.microsoft/r/Ljmf1aWESK

## Verify every URL in an **incognito window** before submitting
- [ ] YouTube video (unlisted link plays)
- [ ] GitHub repo (public, README renders)
- [ ] Live app (loads; `/day-ahead?d=2026-01-15` deep link; `/api/v1/meta`)

## Brief compliance matrix
| Requirement | Where satisfied |
|---|---|
| React front-end, Python back-end | `frontend/`, `backend/` |
| Docker | `Dockerfile`s + `docker-compose.yml` |
| Deploy on Vercel/Heroku | `DEPLOYMENT.md`, README link |
| Understand latest forecasts available at decision time | `/day-ahead` + `day_ahead` policy |
| Quantify forecast accuracy | `/metrics/*`, Accuracy Lab, calibration |
| Wind only, national level, Elexon only | FUELHH(WIND) + WINDFOR; nothing else |
| Decisions in January 2026 | eval window 1–31 Jan 2026 (+Dec warm-up for risk sample, disclosed) |
| ≤ 16 h | time ledger in `PHASES.md` |
| Mention AI usage in README | README §AI usage |
| Customer pitch + tech review video | `VIDEO_SCRIPT.md` |
