#!/usr/bin/env python3
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DATA = ROOT / 'public' / 'data'
LOCAL_DIR = ROOT / 'local'
LOCAL_DIR.mkdir(exist_ok=True)

repos = json.loads((PUBLIC_DATA / 'repos.json').read_text()) if (PUBLIC_DATA / 'repos.json').exists() else []
manual = json.loads((ROOT / 'data' / 'manual-includes.json').read_text()) if (ROOT / 'data' / 'manual-includes.json').exists() else []

report = {
    'generated_at': datetime.now(timezone.utc).isoformat(),
    'repo_count': len(repos),
    'manual_include_count': len(manual),
    'checks': {
        'low_topic_density': [repo['id'] for repo in repos if len(repo.get('topics', [])) == 0][:50],
        'uncategorized_like': [repo['id'] for repo in repos if repo.get('primary_category') == 'AI Apps' and len(repo.get('categories', [])) == 1][:50],
        'manual_includes': manual,
    },
}

path = LOCAL_DIR / 'weekly-review-report.json'
path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(path)
