"""Validate Phase 0 artifacts. Structural evidence, not application tests."""
from pathlib import Path
import hashlib
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'research' / 'evidence'

def main():
    results = []
    def check(name, condition, detail=None):
        results.append({'check': name, 'passed': bool(condition), 'detail': detail})
    for name, expected in {
        'codex_brief.txt': '7e2362349ed526ff053b3d9383e0e5da6a05b251a61aa93d0dddc925b457cf5d',
        'deep-research-report.md': 'b8f643880548b57021aaa705ac22b53e8a27e84ba1672974a94897b193d3b1d0'
    }.items():
        check('original unchanged: ' + name, hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected)
    for name in ['IMPLEMENTATION_PLAN', 'RESEARCH_SUMMARY', 'DATA_SOURCES', 'PANDAS_COVERAGE', 'DESIGN_SPEC']:
        check('required document: ' + name, (ROOT / 'docs' / (name + '.md')).is_file())
    missing_links = []
    for path in [ROOT / 'README.md', *sorted((ROOT / 'docs').glob('*.md'))]:
        for target in re.findall(r'\]\(([^)]+)\)', path.read_text(encoding='utf-8')):
            if target.startswith(('http:', 'https:', '#', 'mailto:')):
                continue
            target = target.split('#')[0]
            if not (path.parent / target).exists():
                missing_links.append({'file': str(path.relative_to(ROOT)), 'target': target})
    check('local document links', not missing_links, missing_links)
    coverage = (ROOT / 'docs' / 'PANDAS_COVERAGE.md').read_text(encoding='utf-8')
    entries = re.findall(r'^\| ([A-Z]{2}\d{2}) [^\n]+', coverage, re.M)
    check('coverage IDs unique and count 50', len(entries) == len(set(entries)) == 50, len(entries))
    check('coverage status honest', '均为 planned' in coverage)
    locks = json.loads((EVIDENCE / 'source-lock.json').read_text(encoding='utf-8-sig'))
    valid_locks = True
    raw_bytes = 0
    for lock in locks:
        path = EVIDENCE / 'raw' / lock['name']
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        raw_bytes += path.stat().st_size
        valid_locks &= digest == lock['sha256'] == lock['expected_digest'].removeprefix('sha256:')
        valid_locks &= path.stat().st_size == lock['size']
    check('10 assets match API/local SHA256 and size', valid_locks and len(locks) == 10, {'assets': len(locks), 'raw_bytes': raw_bytes})
    audit = json.loads((EVIDENCE / 'data-audit.json').read_text(encoding='utf-8'))
    expected = {'games': 219, 'players': 498, 'teams': 30, 'player_game_stats': 5698, 'team_game_stats': 438, 'shots': 39092}
    check('default snapshot measured counts', all(audit['default_subset'][k] == v for k, v in expected.items()), audit['default_subset'])
    check('shot/box FGA FGM internal consistency', audit['relations']['shot_box_totals']['mismatch_team_games'] == 0)
    check('shot foreign keys', audit['relations']['shots_to_player']['unmatched_rows'] == audit['relations']['shots_to_team']['unmatched_rows'] == 0)
    ET.parse(ROOT / 'docs' / 'DESIGN_BOARD.svg')
    check('SVG parses', True)
    check('no application implementation in Phase 0', not (ROOT / 'src').exists() and not (ROOT / 'package.json').exists())
    output = {'date_local': '2026-10-15', 'scope': 'Phase 0 documents and source audit; no app tests/build/deployment',
              'passed': all(r['passed'] for r in results), 'checks': results}
    (EVIDENCE / 'phase0-validation.json').write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(output, ensure_ascii=False, indent=2))
    if not output['passed']:
        raise SystemExit(1)

if __name__ == '__main__':
    main()
