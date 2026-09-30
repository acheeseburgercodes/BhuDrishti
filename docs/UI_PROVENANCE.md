# UI component provenance

| Component | File | Origin |
| --- | --- | --- |
| Segmented control with sliding indicator | `frontend/src/components/ui.jsx` | Original code; pattern inspired by 21st.dev community "animated tabs / segmented control" components |
| Animated number ticker | `ui.jsx` (`AnimatedNumber`) | Original; inspired by 21st.dev "number ticker" components; respects reduced motion |
| Status pill with pulse | `ui.jsx` (`Badge pulse`) | Original; inspired by 21st.dev status-badge patterns |
| Tab underline transition, rise-in cards | `App.jsx`, `index.css` | Original |
| Map | `CorridorMap.jsx` | MapLibre GL JS (BSD-3-Clause); basemaps: OpenFreeMap (OpenMapTiles/OSM data, ODbL) or OSM raster tiles |

**No 21st.dev code was copied or installed.** 21st.dev's terms state that published
components belong to their authors and 21st Labs, and per-component licences were not
verified during this run, so components were re-implemented from the interaction idea
only. If you later install a 21st.dev component via `npx shadcn add`, record its author,
URL and licence in this table.

Tile usage: the OSM raster option is for light, attributed use under the OSM tile usage
policy; use OpenFreeMap or a self-hosted tile server for anything heavier.
