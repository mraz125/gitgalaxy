#!/usr/bin/env python3
import json
import math
import os
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DATA = ROOT / 'public' / 'data'
MANUAL_INCLUDES = ROOT / 'data' / 'manual-includes.json'
TOKEN = os.environ.get('GITHUB_TOKEN') or os.environ.get('GH_TOKEN')
USER_AGENT = 'GitGalaxyDatasetBuilder'
MIN_STARS = int(os.environ.get('GITGALAXY_MIN_STARS', '500'))
MAX_NEIGHBORS = int(os.environ.get('GITGALAXY_MAX_NEIGHBORS', '10'))
REQUEST_DELAY = float(os.environ.get('GITGALAXY_REQUEST_DELAY', '1.3'))
MAX_PAGES_PER_QUERY = int(os.environ.get('GITGALAXY_MAX_PAGES_PER_QUERY', '2'))
STAR_BUCKETS = [(500, 999), (1000, 2499), (2500, 4999), (5000, 9999), (10000, None)]

CATEGORY_QUERY_TERMS = {
    'LLM': ['topic:llm', 'topic:language-model'],
    'Agents': ['topic:agents', 'topic:autonomous-agents', 'agentic-ai'],
    'RAG': ['topic:rag', 'retrieval-augmented'],
    'Inference': ['topic:inference', 'vllm', 'llama.cpp'],
    'Fine-tuning': ['topic:fine-tuning', 'qlora', 'lora'],
    'Evaluation': ['topic:evaluation', 'benchmark', 'evals'],
    'AI Apps': ['topic:ai', 'topic:copilot', 'topic:assistant'],
    'Multimodal': ['topic:multimodal', 'topic:vision', 'topic:speech'],
}

KEYWORD_TO_CATEGORY = {
    'llm': 'LLM',
    'language-model': 'LLM',
    'language model': 'LLM',
    'agent': 'Agents',
    'agents': 'Agents',
    'agentic': 'Agents',
    'rag': 'RAG',
    'retrieval': 'RAG',
    'vllm': 'Inference',
    'inference': 'Inference',
    'llama.cpp': 'Inference',
    'serving': 'Inference',
    'fine-tuning': 'Fine-tuning',
    'finetuning': 'Fine-tuning',
    'lora': 'Fine-tuning',
    'qlora': 'Fine-tuning',
    'evaluation': 'Evaluation',
    'benchmark': 'Evaluation',
    'evals': 'Evaluation',
    'copilot': 'AI Apps',
    'assistant': 'AI Apps',
    'workflow': 'AI Apps',
    'vision': 'Multimodal',
    'speech': 'Multimodal',
    'audio': 'Multimodal',
    'multimodal': 'Multimodal',
}

STOPWORDS = {
    'the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'your', 'you', 'use', 'build',
    'open', 'source', 'github', 'repository', 'repositories', 'project', 'projects', 'tool', 'tools',
    'platform', 'framework', 'using', 'used', 'about', 'into', 'based', 'models', 'model', 'data',
    'python', 'typescript', 'javascript', 'rust', 'go', 'java', 'plus', 'app', 'apps', 'ai'
}


def github_get_json(url):
    headers = {'Accept': 'application/vnd.github+json', 'User-Agent': USER_AGENT}
    if TOKEN:
        headers['Authorization'] = f'Bearer {TOKEN}'
    request = Request(url, headers=headers)
    attempts = 0
    while True:
        try:
            with urlopen(request, timeout=30) as response:
                return json.loads(response.read().decode('utf-8'))
        except HTTPError as exc:
            attempts += 1
            if exc.code not in {403, 429} or attempts >= 4:
                raise
            reset_at = exc.headers.get('X-RateLimit-Reset')
            retry_after = exc.headers.get('Retry-After')
            wait_seconds = 65
            if retry_after and retry_after.isdigit():
                wait_seconds = max(wait_seconds, int(retry_after))
            elif reset_at and reset_at.isdigit():
                wait_seconds = max(wait_seconds, int(reset_at) - int(time.time()) + 2)
            time.sleep(wait_seconds)


def star_bucket_clause(low, high):
    if high is None:
        return f'stars:>={low}'
    return f'stars:{low}..{high}'


def tokenize(text):
    text = (text or '').lower().replace('/', ' ')
    tokens = re.findall(r'[a-z0-9][a-z0-9+.#-]{1,}', text)
    return {token for token in tokens if token not in STOPWORDS and len(token) > 2}


def infer_categories(item):
    score_map = Counter(item.get('category_scores') or {})
    bucket = set(item.get('categories', []))
    haystack = ' '.join(item.get('topics', []) + [item.get('description') or '']).lower()
    for keyword, category in KEYWORD_TO_CATEGORY.items():
        if keyword in haystack:
            bucket.add(category)
            score_map[category] += 1
    if not bucket:
        bucket.add('AI Apps')
        score_map['AI Apps'] += 1
    return [name for name, _score in sorted(score_map.items(), key=lambda value: (-value[1], value[0])) if name in bucket]


def repo_to_node(item):
    topics = sorted(set(item.get('topics') or []))
    categories = infer_categories(item)
    primary = categories[0] if categories else 'Other'
    stars = int(item.get('stargazers_count') or item.get('stars') or 0)
    size = round(5 + math.log10(max(stars, 1)) * 2.5, 2)
    description = item.get('description') or ''
    return {
        'id': item['full_name'],
        'name': item['name'],
        'owner': item['owner']['login'] if isinstance(item.get('owner'), dict) else item['full_name'].split('/')[0],
        'html_url': item['html_url'],
        'description': description,
        'stars': stars,
        'language': item.get('language'),
        'topics': topics,
        'categories': categories,
        'primary_category': primary,
        'updated_at': item.get('updated_at') or item.get('pushed_at'),
        'homepage': item.get('homepage'),
        'fork': bool(item.get('fork')),
        'archived': bool(item.get('archived')),
        'size': size,
        'keywords': sorted(tokenize(' '.join(topics) + ' ' + description))[:18],
        'category_scores': dict(item.get('category_scores', {})),
    }


def merge_repo(repos, category_hits, category, item):
    if item.get('archived') or item.get('fork'):
        return
    full_name = item['full_name']
    if full_name not in repos:
        item['categories'] = []
        item['category_scores'] = {}
        repos[full_name] = item
    current = repos[full_name]
    current.setdefault('categories', [])
    current.setdefault('category_scores', {})
    if category not in current['categories']:
        current['categories'].append(category)
        category_hits[category] += 1
    current['category_scores'][category] = current['category_scores'].get(category, 0) + 1


def fetch_query(term, low, high):
    query = f'{term} {star_bucket_clause(low, high)} archived:false fork:false'
    params = {'q': query, 'per_page': 100, 'page': 1, 'sort': 'stars', 'order': 'desc'}
    url = 'https://api.github.com/search/repositories?' + urlencode(params, quote_via=quote)
    payload = github_get_json(url)
    items = payload.get('items', [])
    total_count = int(payload.get('total_count') or 0)
    page_count = min(MAX_PAGES_PER_QUERY, max(1, math.ceil(min(total_count, 1000) / 100)))
    all_items = list(items)
    for page in range(2, page_count + 1):
        params['page'] = page
        page_url = 'https://api.github.com/search/repositories?' + urlencode(params, quote_via=quote)
        all_items.extend(github_get_json(page_url).get('items', []))
        time.sleep(REQUEST_DELAY)
    return all_items


def fetch_search_results():
    repos = {}
    category_hits = defaultdict(int)
    for category, terms in CATEGORY_QUERY_TERMS.items():
        for term in terms:
            for low, high in STAR_BUCKETS:
                for item in fetch_query(term, low, high):
                    merge_repo(repos, category_hits, category, item)
                time.sleep(REQUEST_DELAY)
    return repos, category_hits


def load_manual_includes():
    if not MANUAL_INCLUDES.exists():
        return []
    return json.loads(MANUAL_INCLUDES.read_text())


def merge_manual_includes(repos):
    for item in load_manual_includes():
        full_name = item['full_name']
        if full_name in repos:
            current = repos[full_name].setdefault('categories', [])
            scores = repos[full_name].setdefault('category_scores', {})
            for category in item.get('categories', []):
                if category not in current:
                    current.append(category)
                scores[category] = scores.get(category, 0) + 3
            repos[full_name]['manual_reason'] = item.get('reason', '')
            continue
        payload = github_get_json(f'https://api.github.com/repos/{full_name}')
        payload['categories'] = item.get('categories', [])
        payload['category_scores'] = {category: 3 for category in item.get('categories', [])}
        payload['manual_reason'] = item.get('reason', '')
        repos[full_name] = payload
        time.sleep(REQUEST_DELAY)


def build_graph(nodes):
    link_scores = {}
    neighbors = defaultdict(list)
    for idx, left in enumerate(nodes):
        left_topics = set(left.get('topics', []))
        left_categories = set(left.get('categories', []))
        left_keywords = set(left.get('keywords', []))
        for right in nodes[idx + 1:]:
            score = 0.0
            shared_topics = left_topics & set(right.get('topics', []))
            shared_categories = left_categories & set(right.get('categories', []))
            shared_keywords = left_keywords & set(right.get('keywords', []))
            if shared_categories:
                score += 2.5 * min(2, len(shared_categories))
            if shared_topics:
                score += 1.3 * min(3, len(shared_topics))
            if shared_keywords:
                score += 0.4 * min(5, len(shared_keywords))
            if left.get('language') and left.get('language') == right.get('language'):
                score += 0.7
            if score >= 3.5:
                pair = tuple(sorted((left['id'], right['id'])))
                neighbors[left['id']].append((right['id'], score))
                neighbors[right['id']].append((left['id'], score))
                link_scores[pair] = score

    selected_pairs = set()
    for node in nodes:
        ranked = sorted(neighbors[node['id']], key=lambda item: (-item[1], item[0]))[:MAX_NEIGHBORS]
        for target_id, _score in ranked:
            selected_pairs.add(tuple(sorted((node['id'], target_id))))

    links = [
        {
            'source': source,
            'target': target,
            'weight': round(link_scores[(source, target)], 2),
        }
        for source, target in sorted(selected_pairs)
    ]

    return {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'min_stars': MIN_STARS,
        'stats': {
            'repo_count': len(nodes),
            'link_count': len(links),
            'category_count': len({category for node in nodes for category in node.get('categories', [])}),
        },
        'nodes': nodes,
        'links': links,
    }


def main():
    PUBLIC_DATA.mkdir(parents=True, exist_ok=True)
    repos, category_hits = fetch_search_results()
    merge_manual_includes(repos)
    nodes = [
        repo_to_node(item)
        for item in repos.values()
        if int(item.get('stargazers_count') or item.get('stars') or 0) >= MIN_STARS or item.get('manual_reason')
    ]
    nodes.sort(key=lambda item: (-item['stars'], item['id'].lower()))
    graph = build_graph(nodes)

    summary = {
        'generated_at': graph['generated_at'],
        'repo_count': len(nodes),
        'category_hits': dict(category_hits),
        'primary_category_distribution': dict(Counter(node['primary_category'] for node in nodes)),
        'min_stars': MIN_STARS,
        'manual_include_count': len(load_manual_includes()),
    }

    (PUBLIC_DATA / 'repos.json').write_text(json.dumps(nodes, ensure_ascii=False, indent=2) + '\n')
    (PUBLIC_DATA / 'graph.json').write_text(json.dumps(graph, ensure_ascii=False, indent=2) + '\n')
    (PUBLIC_DATA / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'update_dataset failed: {exc}', file=sys.stderr)
        raise
