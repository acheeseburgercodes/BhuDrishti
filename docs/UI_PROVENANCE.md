# UI component provenance

| Component | File | Origin |
| --- | --- | --- |
| Segmented control with sliding indicator | `frontend/src/components/ui.jsx` | Original code; pattern inspired by 21st.dev community "animated tabs / segmented control" components |
| Animated number ticker | `ui.jsx` (`AnimatedNumber`) | Original; inspired by 21st.dev "number ticker" components; respects reduced motion |
| Status pill with pulse | `ui.jsx` (`Badge pulse`) | Original; inspired by 21st.dev status-badge patterns |
| Tab underline transition, rise-in cards | `App.jsx`, `index.css` | Original |
| Scroll reveal, spotlight card, marquee, bento layout, pills and accordion | `frontend/src/home/primitives.jsx` | Original BhuDrishti implementations inspired by interaction patterns catalogued on 21st.dev and Magic UI; reduced-motion, keyboard and touch behavior adapted locally |
| Animated sensor-to-review signal path and interactive stepper | `frontend/src/home/SignalFlow.jsx` | Original BhuDrishti artwork and code; inspired by animated-beam and stepper patterns found through 21st.dev |
| Interactive coverage-gap network preview | `frontend/src/home/NetworkPreview.jsx` | Original BhuDrishti SVG/data visualization; not copied from an external component |
| Public homepage composition and mobile navigation | `frontend/src/home/HomePage.jsx` | Original BhuDrishti composition using the locally implemented primitives above |
| Map | `CorridorMap.jsx` | MapLibre GL JS (BSD-3-Clause); basemaps: OpenFreeMap (OpenMapTiles/OSM data, ODbL) or OSM raster tiles |

**No 21st.dev code was copied or installed.** 21st.dev's terms state that published
components belong to their authors and 21st Labs, and per-component licences were not
verified during this run, so components were re-implemented from the interaction idea
only. Magic UI's public repository is MIT licensed; its patterns were used as visual
reference, without copying source. If you later install a 21st.dev component via
`npx shadcn add`, record its author, URL and licence in this table.

Tile usage: the OSM raster option is for light, attributed use under the OSM tile usage
policy; use OpenFreeMap or a self-hosted tile server for anything heavier.
