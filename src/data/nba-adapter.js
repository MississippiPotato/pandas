import { ensure } from '../core/errors.js';
export const BOX_FIELDS = Object.freeze({
  pts: 'points', reb: 'rebounds_total', ast: 'assists', stl: 'steals', blk: 'blocks', tov: 'turnovers', pf: 'fouls_personal', plus_minus: 'plus_minus_points',
  fgm: 'field_goals_made', fga: 'field_goals_attempted', fg_pct: 'field_goals_percentage',
  fg3m: 'three_pointers_made', fg3a: 'three_pointers_attempted', fg3_pct: 'three_pointers_percentage',
  ftm: 'free_throws_made', fta: 'free_throws_attempted', ft_pct: 'free_throws_percentage', oreb: 'rebounds_offensive', dreb: 'rebounds_defensive'
});
export function minutes(value) {
  if (value === '' || value === null) return null;
  // Upstream V3 boxscores contain rounded :60. Carry exactly one minute,
  // retain minutes_raw, and record every affected row in the manifest.
  ensure(/^\d+:\d{2}$/.test(value) && Number(value.split(':')[1]) <= 60, 'NBA_MINUTES', { value });
  const [m, s] = value.split(':').map(Number); return m + s / 60;
}
function number(value, field) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value); ensure(Number.isFinite(parsed), 'NBA_NUMBER', { field, value }); return parsed;
}
export function boxRecord(raw, game, isPlayer) {
  const m = minutes(raw.minutes);
  const record = { game_id: raw.game_id, team_id: raw.team_id, side: raw.side,
    game_date: game.game_date, season: Number(game.season), season_type: game.season_type,
    minutes_raw: raw.minutes || null, minutes: m,
    ...Object.fromEntries(Object.entries(BOX_FIELDS).map(([name, source]) => [name, number(raw[source], source)])) };
  if (isPlayer) Object.assign(record, { player_id: raw.person_id, player_name: `${raw.first_name} ${raw.family_name}`.trim(), position: raw.position || null,
    comment: raw.comment || null, played: m !== null && m > 0 });
  else Object.assign(record, { team_abbr: raw.team_tricode,
    wl: raw.side === 'home' ? game.home_wl : game.away_wl });
  return record;
}
export function normalizeNBA({ schedule, playerBox, teamBox, shots, shotSourceHash }, { start = '2025-11-01', end = '2025-11-30' } = {}) {
  const games = schedule.filter(g => g.season_type === 'regular-season' && g.game_date >= start && g.game_date <= end)
    .map(g => ({ ...g, season: Number(g.season), home_pts: number(g.home_pts, 'home_pts'), away_pts: number(g.away_pts, 'away_pts') }));
  const byGame = new Map(games.map(g => [g.game_id, g])); ensure(byGame.size === games.length, 'NBA_GAME_KEY');
  const player_game_stats = playerBox.filter(r => byGame.has(r.game_id)).map(r => boxRecord(r, byGame.get(r.game_id), true));
  const team_game_stats = teamBox.filter(r => byGame.has(r.game_id)).map(r => boxRecord(r, byGame.get(r.game_id), false));
  const names = new Map(), conflicts = [];
  for (const r of player_game_stats) {
    if (names.has(r.player_id) && names.get(r.player_id) !== r.player_name) conflicts.push({ player_id: r.player_id, first: names.get(r.player_id), next: r.player_name });
    else names.set(r.player_id, r.player_name);
  }
  const players = [...names].sort(([a], [b]) => a < b ? -1 : 1).map(([player_id, player_name]) => ({ player_id, player_name }));
  const teamMap = new Map();
  for (const r of teamBox.filter(r => byGame.has(r.game_id))) {
    const value = { team_id: r.team_id, team_abbr: r.team_tricode, team_name: r.team_name, team_city: r.team_city };
    if (teamMap.has(r.team_id)) ensure(JSON.stringify(teamMap.get(r.team_id)) === JSON.stringify(value), 'NBA_TEAM_CONFLICT');
    teamMap.set(r.team_id, value);
  }
  const teams = [...teamMap.values()].sort((a, b) => a.team_id < b.team_id ? -1 : 1);
  const normalizedShots = shots.flatMap((r, i) => {
    if (!byGame.has(r.game_id)) return [];
    ensure(['Made', 'Missed'].includes(r.shot_result), 'NBA_SHOT_RESULT');
    const game = byGame.get(r.game_id);
    return [{ shot_id: `${shotSourceHash}:${i}`, game_id: r.game_id, player_id: r.person_id, team_id: r.team_id,
      game_date: game.game_date, season: Number(game.season), season_type: game.season_type,
      period: number(r.period, 'period'), clock: r.clock, action_type: r.action_type, sub_type: r.sub_type || null,
      shot_result: r.shot_result, made: r.shot_result === 'Made', shot_value: number(r.shot_value, 'shot_value'),
      shot_distance: number(r.shot_distance, 'shot_distance'), x_legacy: number(r.x_legacy, 'x_legacy'), y_legacy: number(r.y_legacy, 'y_legacy') }];
  });
  const secondsCarry = [...player_game_stats, ...team_game_stats].filter(r => r.minutes_raw?.endsWith(':60'))
    .map(r => ({ game_id: r.game_id, player_id: r.player_id ?? null, team_id: r.team_id, raw: r.minutes_raw, normalizedMinutes: r.minutes }));
  return { tables: { players, teams, games, player_game_stats, team_game_stats, shots: normalizedShots }, report: { playerNameConflicts: conflicts, secondsCarry } };
}
