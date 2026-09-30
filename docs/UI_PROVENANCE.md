# UI component provenance

| Component | File | Origin |
| --- | --- | --- |
| Landing page composition, header and mobile menu | `frontend/src/home/HomePage.jsx` | Original BhuDrishti code |
| Landing copy (English / Nepali / Hindi) | `frontend/src/home/copy.js` | Original; Nepali and Hindi still need native-speaker review |
| Section, button, card, radio-group ("Choice"), accordion, ridge-line SVG | `frontend/src/home/landing-ui.jsx` | Original; accordion and radio group follow the WAI-ARIA Authoring Practices patterns |
| Network status panel | `frontend/src/home/NetworkStatus.jsx` | Original; reads public API endpoints through `lib/api.js` |
| Coverage-gap preview | `frontend/src/home/NetworkPreview.jsx` | Original SVG drawn from the shared coverage model (`shared/src/coverage.js`) |
| Theme provider and toggle | `frontend/src/lib/theme.jsx` | Original |
| Segmented control, animated number, status pill | `frontend/src/components/ui.jsx` (portal) | Original; interaction ideas similar to common 21st.dev community components, no code copied |
| Map | `CorridorMap.jsx` | MapLibre GL JS (BSD-3-Clause); basemaps: OpenFreeMap (OpenMapTiles/OSM data, ODbL) or OSM raster tiles |

**No 21st.dev, shadcn or Magic UI code is installed or copied.** The September 2026 landing
rework removed the earlier pattern-inspired primitives (scroll reveal, spotlight card,
marquee, animated signal beams, stepper) instead of replacing them with library components:
the page needed less motion, not different motion, and 21st.dev's terms leave ownership with
each component's author with per-component licences that were not verified. If a 21st.dev
component is added later via `npx shadcn add`, record its author, URL and licence here.

Visuals are local: the ridge-line SVG, icons and the logo mark are hand-written SVG in the
files above. No stock imagery, endorsements or operational statistics are used; the only
figures on the landing page come from the API (or the labelled offline fixture) and from
the shared coverage model run on the demo seed.

Motion policy: hover/focus colour changes, a 240 ms fade on menu/FAQ open, nothing looping.
`prefers-reduced-motion: reduce` disables all transitions and animations (`index.css`).

Tile usage: the OSM raster option is for light, attributed use under the OSM tile usage
policy; use OpenFreeMap or a self-hosted tile server for anything heavier.
