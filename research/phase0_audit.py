"""Offline Phase 0 source audit; standard library only, no application runtime.
Run after downloading the assets identified by evidence/source-lock.json.
"""
from pathlib import Path
import csv
import gzip
import hashlib
import json
from collections import Counter

BASE = Path(__file__).resolve().parent
OUT = BASE / 'evidence'

def load(path):
    opener = gzip.open if path.suffix == '.gz' else open
    with opener(path, 'rt', encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream)
        return reader.fieldnames, list(reader)

def audit(name, columns, rows):
    fields = set(columns)
    result = {'file': name, 'rows': len(rows), 'columns': columns,
              'column_count': len(columns), 'first_row': rows[0] if rows else {},
              'missing_counts': {f: sum(r.get(f) in ('', None, 'NA', 'NaN') for r in rows) for f in columns}}
    for field in ['season', 'season_type', 'season_type_id', 'measure_type', 'per_mode', 'shot_result', 'shot_value']:
        if field in fields:
            result[field] = dict(Counter(r[field] for r in rows))
    for field in ['game_date', 'game_date_time']:
        if field in fields:
            values = [r[field] for r in rows if r[field]]
            result[field + '_range'] = [min(values), max(values)] if values else []
    for field in ['game_id', 'person_id', 'player_id', 'team_id']:
        if field in fields:
            result[field + '_unique'] = len({r[field] for r in rows if r[field]})
    for keys in [('game_id',), ('game_id', 'team_id'), ('game_id', 'person_id'),
                 ('game_id', 'game_event_id'), ('player_id', 'season', 'season_type', 'measure_type', 'per_mode')]:
        if set(keys) <= fields:
            result['duplicate_' + '+'.join(keys)] = len(rows) - len({tuple(r[k] for k in keys) for r in rows})
    for field in ['x_legacy', 'y_legacy', 'min', 'minutes', 'pts']:
        if field in fields:
            vals = []
            for row in rows:
                try:
                    vals.append(float(row[field]))
                except (TypeError, ValueError):
                    pass
            result[field + '_range'] = [min(vals), max(vals)] if vals else []
    if 'measure_type' in fields:
        filtered = [r for r in rows if r.get('measure_type') == 'base' and r.get('per_mode') == 'pergame' and r.get('season_type') == 'regular-season']
        result['base_pergame_regular_rows'] = len(filtered)
    return result

def main():
    locks = json.loads((OUT / 'source-lock.json').read_text(encoding='utf-8-sig'))
    report = {'audit_date_local': '2026-10-15', 'timezone': 'Asia/Singapore', 'assets': [], 'relations': {}}
    data = {}
    for lock in locks:
        path = OUT / 'raw' / lock['name']
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        assert digest == lock['sha256'] == lock['expected_digest'].removeprefix('sha256:'), path
        assert path.stat().st_size == lock['size'], path
        columns, rows = load(path)
        data[lock['name']] = rows
        entry = audit(lock['name'], columns, rows)
        entry['sha256'] = digest
        report['assets'].append(entry)
        print(lock['name'], len(rows), 'rows,', len(columns), 'columns', flush=True)
    schedule = data.get('nba_schedule_2026.csv.gz', [])
    games = {r['game_id'] for r in schedule}
    regular_games = {r['game_id'] for r in schedule if r['season_type'] == 'regular-season'}
    for name in ['player_game_logs_2026.csv', 'player_boxscores_2026.csv', 'team_boxscores_2026.csv', 'shots_2026.csv']:
        rows = data.get(name, [])
        if not rows:
            continue
        unmatched = {r['game_id'] for r in rows if r['game_id'] not in games}
        report['relations'][name] = {'rows_not_in_schedule': sum(r['game_id'] not in games for r in rows),
                                   'distinct_games_not_in_schedule': len(unmatched),
                                   'unmatched_examples': sorted(unmatched)[:5],
                                   'schedule_games_without_rows': len(games - {r['game_id'] for r in rows})}
        report['relations'][name]['regular_rows'] = sum(r['game_id'] in regular_games for r in rows)
        report['relations'][name]['regular_games_without_rows'] = len(regular_games - {r['game_id'] for r in rows})
    teams = data.get('team_boxscores_2026.csv', [])
    players = data.get('player_boxscores_2026.csv', [])
    shots = data.get('shots_2026.csv', [])
    team_keys = {(r['game_id'], r['team_id']) for r in teams}
    report['relations']['shots_to_team'] = {'unmatched_rows': sum((r['game_id'], r['team_id']) not in team_keys for r in shots)}
    player_keys = {(r['game_id'], r['person_id']) for r in players}
    report['relations']['shots_to_player'] = {'unmatched_rows': sum((r['game_id'], r['person_id']) not in player_keys for r in shots)}
    attempts = Counter((r['game_id'], r['team_id']) for r in shots)
    made = Counter((r['game_id'], r['team_id']) for r in shots if r['shot_result'] == 'Made')
    mismatch = []
    for row in teams:
        key = (row['game_id'], row['team_id'])
        if attempts[key] != int(row['field_goals_attempted']) or made[key] != int(row['field_goals_made']):
            mismatch.append({'game_id': key[0], 'team_id': key[1], 'shots_fga': attempts[key],
                             'box_fga': row['field_goals_attempted'], 'shots_fgm': made[key], 'box_fgm': row['field_goals_made']})
    report['relations']['shot_box_totals'] = {'mismatch_team_games': len(mismatch), 'examples': mismatch[:5]}
    report['relations']['player_participation'] = {'empty_minutes': sum(not r['minutes'] for r in players),
                                                  'nonempty_comment': sum(bool(r['comment']) for r in players),
                                                  'regular_players': len({r['person_id'] for r in players if r['game_id'] in regular_games})}
    subset_games = {r['game_id'] for r in schedule if r['season_type'] == 'regular-season' and '2025-11-01' <= r['game_date'] <= '2025-11-30'}
    subset_players = [r for r in players if r['game_id'] in subset_games]
    subset_teams = [r for r in teams if r['game_id'] in subset_games]
    subset_shots = [r for r in shots if r['game_id'] in subset_games]
    report['default_subset'] = {'rule': '2025-11-01 <= game_date <= 2025-11-30 AND season_type == regular-season',
                              'games': len(subset_games), 'player_game_stats': len(subset_players),
                              'played_player_game_stats': sum(bool(r['minutes']) for r in subset_players),
                              'players': len({r['person_id'] for r in subset_players}),
                              'teams': len({r['team_id'] for r in subset_teams}), 'team_game_stats': len(subset_teams),
                              'shots': len(subset_shots),
                              'game_date_range': [min(r['game_date'] for r in schedule if r['game_id'] in subset_games),
                                                  max(r['game_date'] for r in schedule if r['game_id'] in subset_games)]}
    (OUT / 'data-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

if __name__ == '__main__':
    main()
