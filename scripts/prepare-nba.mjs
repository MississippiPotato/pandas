import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { csvParse } from 'd3';
import { normalizeNBA } from '../src/data/nba-adapter.js';
import { createTable } from '../src/core/dataset.js';
import { exportCSV } from '../src/core/export.js';
const root = new URL('../', import.meta.url), raw = new URL('research/evidence/raw/', root), target = new URL('public/data/nba/2025-26-nov/', root);
const locks = JSON.parse((await readFile(new URL('research/evidence/source-lock.json', root), 'utf8')).replace(/^\uFEFF/, ''));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function load(name) {
  const lock = locks.find(l => l.name === name), data = await readFile(new URL(name, raw));
  if (digest(data) !== lock.sha256 || data.length !== lock.size) throw new Error(`Source lock failed: ${name}`);
  return csvParse((name.endsWith('.gz') ? gunzipSync(data) : data).toString('utf8'));
}
const sourceNames = ['nba_schedule_2026.csv.gz', 'player_boxscores_2026.csv', 'team_boxscores_2026.csv', 'shots_2026.csv'];
const [schedule, playerBox, teamBox, shots] = await Promise.all(sourceNames.map(load));
const { tables, report } = normalizeNBA({ schedule, playerBox, teamBox, shots, shotSourceHash: locks.find(l => l.name === sourceNames[3]).sha256 });
await mkdir(target, { recursive: true });
const manifest = { id: 'nba-2025-26-nov', schemaVersion: 1, normalizedAt: '2026-10-15',
  range: { start: '2025-11-01', end: '2025-11-30', season: '2025–26', seasonType: 'regular-season', fullSeason: false },
  attribution: { publisher: 'SportsDataverse', upstream: 'NBA.com/Stats', url: 'https://github.com/sportsdataverse/sportsdataverse-data', purpose: 'Educational non-commercial local analysis' },
  licenseClaim: 'CC-BY-4.0', redistributionStatus: 'pending-upstream-review',
  coordinates: { status: 'provider-defined-and-local-consistency-checked', enabled: true, fields: ['x_legacy', 'y_legacy'],inputUnit:'0.1 ft',origin:'shooting basket center',x:'negative shooter left',y:'positive away from baseline',transformVersion:'sdv-legacy-vertical-v1',display:'raw legacy values; court geometry scaled to match',reference:'https://sdvplotr.sportsdataverse.org/reference/sdv_court_coords.html',officialDictionaryVerified:false,preserveFullExtent:true,note:'Provider-attributed court overlay; no direct NBA dictionary claim. Preserve all finite coordinates, origin events and six beyond-half-court heaves.' },
  verification:{officialGameBooks:3,independentNumericChecks:81,scope:'Purposive spot check, not complete event verification'},
  licenseNotices:{publisherReadme:'CC BY 4.0 badge',publisherSoftwareLicense:'MIT',upstreamAuthorization:'Applicability remains under review; educational purpose alone is not an authorization record',publisherCommit:'c30618f5f439abc8275f0a9bea30892a598890b8'},
  transformations: ['schedule: regular-season and November 2025', 'box: retain DNP, parse MM:SS, attach game_date', 'player IDs/names from player box; no roster join',
    'shots: preserve all selected events; original hash + original row ordinal; no dedup or coordinate clipping'],
  sources: locks.filter(l => sourceNames.includes(l.name)), quality: report, tables: [] };
for (const [name, records] of Object.entries(tables)) {
  const table = createTable(records, { id: name }), text = exportCSV(table);
  const columns = table.columns.map(c => ({ name: c.name, type: /(^|_)id$/.test(c.name) ? 'string' : c.name === 'game_date' ? 'date' : c.type,
    description: { 'zh-CN': c.name, 'en-US': c.name }, unit: ['minutes'].includes(c.name) ? 'minutes' : c.name.endsWith('_pct') ? 'ratio' : c.name === 'shot_distance' ? 'feet' : ['x_legacy','y_legacy'].includes(c.name)?'0.1 feet (provider definition)':null }));
  await writeFile(new URL(`${name}.csv`, target), text, 'utf8');
  manifest.tables.push({ id: name, file: `${name}.csv`, rows: records.length, bytes: Buffer.byteLength(text), sha256: digest(text), columns, lazy: name === 'shots' });
}
await writeFile(new URL('manifest.json', target), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ tables: manifest.tables.map(({ id, rows, bytes }) => ({ id, rows, bytes })), quality: report }, null, 2));
