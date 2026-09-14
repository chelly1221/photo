import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Natural Earth v5.1.2, public-domain data only; no OSM tiles, fonts or styles.
const base = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/';
const out = new URL('../public/maps/natural-earth/', import.meta.url);
await mkdir(out, { recursive: true });
const manifest = [];
async function source(name) {
  const response = await fetch(base + name + '.geojson');
  if (!response.ok) throw new Error(`Natural Earth download failed: ${name} (${response.status})`);
  const body = await response.text();
  manifest.push({ name, url: base + name + '.geojson', sha256: createHash('sha256').update(body).digest('hex') });
  return JSON.parse(body);
}
const round = coords => typeof coords[0] === 'number' ? coords.map(n => Math.round(n * 1e4) / 1e4) : coords.map(round);
function simplify(points, tolerance = 0.025) {
  if (points.length <= 2) return points;
  const keep = new Set([0, points.length - 1]), stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    const [ax, ay] = points[first], [bx, by] = points[last], dx = bx - ax, dy = by - ay;
    let farthest = -1, distance = tolerance * tolerance;
    for (let i = first + 1; i < last; i++) {
      const [x, y] = points[i];
      const t = dx || dy ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))) : 0;
      const d = (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2;
      if (d > distance) { farthest = i; distance = d; }
    }
    if (farthest >= 0) { keep.add(farthest); stack.push([first, farthest], [farthest, last]); }
  }
  return [...keep].sort((a, b) => a - b).map(i => points[i]);
}
const [countries, regions, lakes, cities] = await Promise.all([
  source('ne_50m_admin_0_countries'), source('ne_10m_admin_1_states_provinces_lines'),
  source('ne_50m_lakes'), source('ne_10m_populated_places'),
]);
async function save(name, value) {
  const body = JSON.stringify(value);
  await writeFile(new URL(name + '.json', out), body);
  console.log(`${name}: ${(Buffer.byteLength(body) / 1024).toFixed(0)} KB`);
}
for (const [name, data] of [['countries', countries], ['regions', regions], ['lakes', lakes]]) {
  await save(name, { type: 'FeatureCollection', features: data.features.filter(feature => feature.geometry).map(feature => {
    let coordinates = feature.geometry.coordinates;
    if (name === 'regions') coordinates = feature.geometry.type === 'LineString' ? simplify(coordinates) : coordinates.map(line => simplify(line));
    return { type: 'Feature', properties: {}, geometry: { type: feature.geometry.type, coordinates: round(coordinates) } };
  }) });
}
const labels = countries.features.filter(f => Number.isFinite(f.properties.LABEL_X) && Number.isFinite(f.properties.LABEL_Y)).map(f => ({
  name: f.properties.NAME_KO || f.properties.NAME_EN || f.properties.NAME,
  position: [f.properties.LABEL_X, f.properties.LABEL_Y], rank: 0, population: f.properties.POP_EST, kind: 'country',
}));
for (const feature of cities.features) {
  const p = feature.properties;
  if (!feature.geometry || !(p.NAME_KO || p.NAME)) continue;
  labels.push({ name: (p.NAME_KO || p.NAME).replace(/(특별시|광역시)$/u, ''), position: round(feature.geometry.coordinates), rank: p.SCALERANK, population: p.POP_MAX, kind: 'city' });
}
await save('labels', labels.sort((a, b) => b.population - a.population));
await save('manifest', { version: '5.1.2', license: 'Public domain', terms: 'https://www.naturalearthdata.com/about/terms-of-use/', sources: manifest.sort((a, b) => a.name.localeCompare(b.name)) });
