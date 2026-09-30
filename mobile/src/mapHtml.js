// MapLibre GL JS inside a WebView (works in Expo Go; no native map SDK or API key).
// Data is pushed in from React Native via postMessage; the page reports errors back so
// the app can fall back to the list view. Library pinned to an exact version.
export const MAPLIBRE_VERSION = '5.9.0'

export const mapHtml = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css">
<style>html,body,#m{margin:0;height:100%;background:#e8ece9}</style></head><body><div id="m"></div>
<script src="https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js"></script>
<script>
const post = (m) => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m));
if (!window.maplibregl) { post({ type: 'error', reason: 'maplibre not loaded (offline?)' }); }
else {
  const offline = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e8ece9' } }] };
  let map, pending = null, ready = false;
  const build = (style) => {
    map = new maplibregl.Map({ container: 'm', style, center: [85.3, 28.07], zoom: 8.6, attributionControl: { compact: true } });
    map.on('style.load', () => {
      map.addSource('coverage', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('rivers', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('nodes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'cov', type: 'fill', source: 'coverage', paint: { 'fill-color': ['match', ['get', 'band'], 'covered', '#15803d', 'partial', '#ca8a04', '#b91c1c'], 'fill-opacity': ['case', ['==', ['get', 'band'], 'uncovered'], ['+', 0.04, ['*', 0.42, ['get', 'risk']]], 0.42] } });
      map.addLayer({ id: 'riv', type: 'line', source: 'rivers', paint: { 'line-color': '#1d4ed8', 'line-width': 2, 'line-dasharray': [2, 1] } });
      map.addLayer({ id: 'nodes', type: 'circle', source: 'nodes', paint: { 'circle-radius': 8, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff',
        'circle-color': ['match', ['get', 'fresh'], 'live', '#15803d', 'recent', '#0f766e', 'stale', '#b45309', 'offline', '#b91c1c', '#6b7280'] } });
      map.on('click', 'nodes', (e) => post({ type: 'node', id: e.features[0].properties.id }));
      ready = true; if (pending) apply(pending); post({ type: 'ready' });
    });
  };
  let styleTimer = setTimeout(() => { if (!ready) { map.remove(); post({ type: 'notice', reason: 'basemap unavailable' }); build(offline); } }, 8000);
  build('https://tiles.openfreemap.org/styles/positron');
  const apply = (d) => { map.getSource('coverage').setData(d.coverage); map.getSource('rivers').setData(d.rivers); map.getSource('nodes').setData(d.nodes); };
  const onMsg = (ev) => { try { const d = JSON.parse(ev.data); if (ready) apply(d); else pending = d; } catch (e) { post({ type: 'error', reason: String(e) }); } };
  document.addEventListener('message', onMsg); window.addEventListener('message', onMsg);
}
</script></body></html>`
