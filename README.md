# BhuDrishti

Early-warning **prototype** for the Trishuli / Bhote Koshi flood and debris-flow corridor
(Rasuwa–Nuwakot, Nepal). ESP32 field nodes and phones submit vibration windows; a FastAPI
service classifies them, cross-confirms independent sources, drafts alerts for human
approval and publishes live state to a web dashboard and an Expo companion app.

> Not a certified life-safety system. Demo values are labelled as demo everywhere. Always
> follow official NDRRMA / DHM instructions.

| Part | Path | Stack |
| --- | --- | --- |
| API | `backend/` | FastAPI, scikit-learn, optional Supabase (PostgREST) |
| Web | `frontend/` | React 18, Vite, Tailwind CSS v4, MapLibre GL |
| Mobile | `mobile/` | Expo SDK 53, expo-sensors, WebView + MapLibre |
| Shared contracts | `shared/` | Dependency-free ESM: validation, offline queue, coverage, i18n |
| Database | `supabase/migrations/` | Idempotent SQL, RLS, Realtime |
| Firmware / bridge | `glof_*`, `BhuDrishti/`, `scripts/esp32_bridge.py` | ESP32 SoftAP `GET 192.168.4.1/events` |

Docs: [architecture](docs/ARCHITECTURE.md) · [API](docs/API.md) · [coverage method](docs/COVERAGE.md) ·
[Supabase](docs/SUPABASE.md) · [AI & language providers](docs/PROVIDERS.md) · [UI provenance](docs/UI_PROVENANCE.md)

## Run it on Windows PowerShell (demo mode, no secrets)

```powershell
# 1. API
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
uvicorn main:app --reload --port 8000        # http://localhost:8000/docs

# 2. Web (new terminal)
cd frontend
npm install
npm run dev                                   # http://localhost:5173  (legacy UI: /#legacy)

# 3. Mobile (new terminal; phone on the same Wi-Fi, Expo Go installed)
cd mobile
npm install
npx expo start                                # set the laptop's LAN URL in the app's Settings tab

# 4. Feed data
python scripts\esp32_bridge.py --demo         # synthetic ESP32/phone events
python scripts\esp32_bridge.py                # real ESP32: polls http://192.168.4.1/events
```

`scripts\start_services.ps1` starts API + web detached; `scripts\health_check.ps1` probes
them. `scripts\verify.ps1` runs every test suite and build.

Without environment variables the API runs in **demo mode**: seed nodes from
`nepal-flood-corridor-seed-data.json` get freshness relative to start-up, everything is
labelled Demo, and data lives in memory. If the web app cannot reach the API it shows a
bundled fixture with an explicit "offline fixture" banner.

## Switching to real services

Copy `.env.example` to `.env` and fill only what you need (names only are committed):

* `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` → persistence (backend only). Apply
  `supabase/migrations/*.sql` first, see [docs/SUPABASE.md](docs/SUPABASE.md).
* `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` → browser Realtime (anon key, RLS-limited).
* `BHUDRISHTI_OPERATOR_TOKEN` → required for alert approval / agent runs from non-loopback clients.
* `BHUDRISHTI_DEVICE_KEY` → require `X-Device-Key` on ingestion (the bridge reads the same variable).
* `SARVAM_API_KEY` → server-side translation. Provider keys → optional LLM refinement.

The service-role, Sarvam and provider keys are never sent to browsers or phones
(`/api/config` exposes only public values; covered by tests).

## Tests

```powershell
.\scripts\verify.ps1          # all suites + web build + mobile bundle
```

Individually: `backend\.venv\Scripts\python.exe -m pytest -q` (repo root),
`npm test` in `shared/`, `mobile/`, `frontend/`, and `npm run build` in `frontend/`.
There is no linter configured yet.

## Model

Logistic regression on transparent features (peak, RMS, zero-crossing rate, dominant FFT
frequency, decay envelope) trained on **synthetic** windows; real-world accuracy is
unknown. `python scripts/retrain_model.py` regenerates `backend/model_artifact.json`.
The ESP32 bridge synthesises waveforms because the sketch sends no raw IMU samples; those
readings carry `synthetic_window: true` and are badged in the UI. When the ESP32 is
unreachable the bridge now sends nothing (previously it posted keep-alives), so the node
correctly goes stale on the dashboard.
