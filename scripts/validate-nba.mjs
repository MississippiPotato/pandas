import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { csvParse } from 'd3';
import { ensure } from '../src/core/errors.js';
const dir = new URL('../public/data/nba/2025-26-nov/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', dir), 'utf8')), tables = {};
const checks = [];
const check = (name, pass, detail = null) => { checks.push({ name, pass, detail }); ensure(pass, 'NBA_VALIDATION', { name, detail }); };
for (const entry of manifest.tables) {
  const bytes = await readFile(new URL(entry.file, dir));
  check(`${entry.id}: SHA256/bytes`, createHash('sha256').update(bytes).digest('hex') === entry.sha256 && bytes.length === entry.bytes);
  tables[entry.id] = csvParse(bytes.toString('utf8'));
  check(`${entry.id}: rows/schema`, tables[entry.id].length === entry.rows && JSON.stringify(tables[entry.id].columns) === JSON.stringify(entry.columns.map(c => c.name)));
}
const expected = { players: 498, teams: 30, games: 219, player_game_stats: 5698, team_game_stats: 438, shots: 39092 };
for (const [name, count] of Object.entries(expected)) check(`${name}: expected frozen count`, tables[name].length === count);
const unique = (table, keys) => new Set(table.map(r => JSON.stringify(keys.map(k => r[k])))).size === table.length;
for (const [name, keys] of Object.entries({ players: ['player_id'], teams: ['team_id'], games: ['game_id'], player_game_stats: ['game_id', 'player_id'], team_game_stats: ['game_id', 'team_id'], shots: ['shot_id'] })) check(`${name}: primary key`, unique(tables[name], keys));
const games = new Map(tables.games.map(g => [g.game_id, g])), playerKeys = new Set(tables.player_game_stats.map(r => `${r.game_id}:${r.player_id}`)), teamKeys = new Set(tables.team_game_stats.map(r => `${r.game_id}:${r.team_id}`));
const playerIds = new Set(tables.players.map(r => r.player_id)), teamIds = new Set(tables.teams.map(r => r.team_id));
for (const name of ['player_game_stats', 'team_game_stats', 'shots']) {
  check(`${name}: game/date/scope foreign key`, tables[name].every(r => games.has(r.game_id) && r.game_date === games.get(r.game_id).game_date && r.game_date >= '2025-11-01' && r.game_date <= '2025-11-30' && r.season_type === 'regular-season'));
  check(`${name}: team foreign key`, tables[name].every(r => teamIds.has(r.team_id)));
}
check('shots/player-game foreign key', tables.shots.every(r => playerKeys.has(`${r.game_id}:${r.player_id}`) && playerIds.has(r.player_id)));
check('shots/team-game foreign key', tables.shots.every(r => teamKeys.has(`${r.game_id}:${r.team_id}`)));
const shotCounts = new Map();
for (const r of tables.shots) { const key = `${r.game_id}:${r.team_id}`; if (!shotCounts.has(key)) shotCounts.set(key, { fga: 0, fgm: 0 }); const c = shotCounts.get(key); c.fga++; c.fgm += r.made === 'true' ? 1 : 0; }
check('shots FGM/FGA equals team box', tables.team_game_stats.every(r => { const c = shotCounts.get(`${r.game_id}:${r.team_id}`); return c?.fga === +r.fga && c?.fgm === +r.fgm; }));
check('team points equal schedule', tables.team_game_stats.every(r => +r.pts === +(r.side === 'home' ? games.get(r.game_id).home_pts : games.get(r.game_id).away_pts)));
const scoringErrors = [];
for (const name of ['player_game_stats', 'team_game_stats']) for (const r of tables[name]) if (r.pts !== '' && +r.pts !== 2 * +r.fgm + +r.fg3m + +r.ftm) scoringErrors.push({ table: name, game: r.game_id, player: r.player_id });
check('PTS = 2*FGM + FG3M + FTM', !scoringErrors.length, scoringErrors.slice(0, 5));
check('DNP not marked played', tables.player_game_stats.every(r => (r.played === 'true') === (r.minutes !== '' && +r.minutes > 0)));
check('provider coordinate definition and raw values retained', manifest.coordinates.enabled === true && manifest.coordinates.officialDictionaryVerified === false && manifest.coordinates.preserveFullExtent && tables.shots.columns.includes('x_legacy') && !tables.shots.columns.includes('x_ft'));
check('publication status retained', manifest.redistributionStatus === 'pending-upstream-review');
check('full coordinate ranges preserve six heaves and origin events',Math.max(...tables.shots.map(r=>+r.y_legacy))===610&&tables.shots.filter(r=>+r.y_legacy>417.5).length===6&&tables.shots.filter(r=>+r.x_legacy===0&&+r.y_legacy===0).length===1125);
const independent=JSON.parse(await readFile(new URL('../research/evidence/official-game-checks.json',import.meta.url),'utf8'));
let officialCount=0;
for(const sample of independent.checks){const game=games.get(sample.game_id),team=tables.team_game_stats.filter(r=>r.game_id===sample.game_id),players=tables.player_game_stats.filter(r=>r.game_id===sample.game_id);for(const fact of sample.checks){let actual;if(fact.check==='game_date')actual=game.game_date;else if(fact.check.endsWith('_schedule_score'))actual=Number(game[fact.check.startsWith('home')?'home_pts':'away_pts']);else{const split=fact.check.lastIndexOf('_'),who=fact.check.slice(0,split),metric=fact.check.slice(split+1);actual=Number(['home','away'].includes(who)?team.find(r=>r.side===who)[metric]:players.find(r=>r.player_name===who)[metric]);}check(`official: ${sample.game_id} ${fact.check}`,actual===fact.expected);officialCount++;}}
const out = new URL('../output/verification/', import.meta.url); await mkdir(out, { recursive: true });
await writeFile(new URL('nba-validation.json', out), JSON.stringify({checks,passed:true,coordinateStatus:manifest.coordinates.status,independentOfficialVerification:{games:3,checks:officialCount},upstreamLicenseApplicability:manifest.redistributionStatus}, null, 2));
console.log(`${checks.length} NBA checks passed, including ${officialCount} official-PDF numeric spot checks. Coordinate overlay is provider-attributed; license applicability remains disclosed.`);
