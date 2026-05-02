import React, { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'

const CATEGORY_COLORS = {
  'LLM': '#8b5cf6',
  'Agents': '#22c55e',
  'RAG': '#06b6d4',
  'Inference': '#f97316',
  'Fine-tuning': '#ef4444',
  'Evaluation': '#eab308',
  'AI Apps': '#3b82f6',
  'Multimodal': '#ec4899',
  'Other': '#94a3b8',
}

function normalizeRepoQuery(input) {
  const trimmed = input.trim()
  if (!trimmed) return ''

  try {
    const url = new URL(trimmed)
    if (url.hostname.includes('github.com')) {
      const parts = url.pathname.split('/').filter(Boolean)
      if (parts.length >= 2) return `${parts[0]}/${parts[1]}`.toLowerCase()
    }
  } catch {
    // noop
  }

  return trimmed.replace(/^github\.com\//, '').replace(/\/$/, '').toLowerCase()
}

function formatStars(value) {
  return new Intl.NumberFormat('en-US').format(value || 0)
}

function formatKST(iso) {
  if (!iso) return '-'
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Seoul',
  }).format(new Date(iso))
}

export default function App() {
  const graphRef = useRef(null)
  const [graph, setGraph] = useState(null)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch('/data/graph.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        setGraph(data)
        if (data.nodes?.length) {
          setSelectedId(data.nodes[0].id)
        }
      })
      .catch((error) => setMessage(`데이터 로드 실패: ${error.message}`))
  }, [])

  const categories = useMemo(() => {
    if (!graph?.nodes) return ['All']
    const values = new Set()
    graph.nodes.forEach((node) => node.categories?.forEach((category) => values.add(category)))
    return ['All', ...Array.from(values)]
  }, [graph])

  const filteredGraph = useMemo(() => {
    if (!graph) return null
    if (activeCategory === 'All') return graph

    const allowed = new Set(
      graph.nodes.filter((node) => node.categories?.includes(activeCategory)).map((node) => node.id),
    )

    return {
      ...graph,
      nodes: graph.nodes.filter((node) => allowed.has(node.id)),
      links: graph.links.filter((link) => allowed.has(link.source) && allowed.has(link.target)),
    }
  }, [graph, activeCategory])

  const neighborMap = useMemo(() => {
    const map = new Map()
    if (!filteredGraph) return map

    filteredGraph.nodes.forEach((node) => map.set(node.id, new Set([node.id])))
    filteredGraph.links.forEach((link) => {
      const source = typeof link.source === 'string' ? link.source : link.source.id
      const target = typeof link.target === 'string' ? link.target : link.target.id
      if (!map.has(source)) map.set(source, new Set([source]))
      if (!map.has(target)) map.set(target, new Set([target]))
      map.get(source).add(target)
      map.get(target).add(source)
    })
    return map
  }, [filteredGraph])

  const selectedNode = useMemo(() => {
    if (!filteredGraph?.nodes?.length) return null
    return filteredGraph.nodes.find((node) => node.id === selectedId) || null
  }, [filteredGraph, selectedId])

  const highlightedIds = useMemo(() => {
    if (!selectedNode) return new Set()
    return neighborMap.get(selectedNode.id) || new Set([selectedNode.id])
  }, [neighborMap, selectedNode])

  const filteredStats = useMemo(() => {
    if (!filteredGraph) return null
    const stars = filteredGraph.nodes.reduce((sum, node) => sum + (node.stars || 0), 0)
    return {
      repoCount: filteredGraph.nodes.length,
      linkCount: filteredGraph.links.length,
      stars,
    }
  }, [filteredGraph])

  const focusNode = (node) => {
    if (!node || !graphRef.current) return
    setSelectedId(node.id)
    graphRef.current.centerAt(node.x || 0, node.y || 0, 450)
    graphRef.current.zoom(5, 450)
  }

  const runSearch = () => {
    const normalized = normalizeRepoQuery(query)
    if (!normalized) {
      setMessage('저장소 이름 또는 GitHub URL을 입력해 주세요.')
      return
    }

    const node = filteredGraph?.nodes.find((item) => item.id.toLowerCase() === normalized)
    if (!node) {
      setMessage(`현재 그래프 범위에서 ${normalized} 저장소를 찾지 못했습니다.`)
      return
    }

    setMessage('')
    focusNode(node)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">AI repository explorer</div>
          <h1>GitGalaxy</h1>
          <p className="subtitle">AI 관련 GitHub 저장소를 별 크기와 연결 관계로 탐색합니다.</p>
        </div>
        <div className="snapshot-card">
          <div>업데이트 시각</div>
          <strong>{formatKST(graph?.generated_at)}</strong>
          <div className="muted">기본 편입 기준: stars ≥ 500</div>
        </div>
      </header>

      <section className="controls">
        <div className="searchbox">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && runSearch()}
            placeholder="owner/repo 또는 GitHub URL 검색"
          />
          <button onClick={runSearch}>찾기</button>
        </div>
        <div className="category-row">
          {categories.map((category) => (
            <button
              key={category}
              className={category === activeCategory ? 'chip active' : 'chip'}
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
        {message ? <div className="message">{message}</div> : null}
      </section>

      <main className="main-grid">
        <section className="graph-panel card">
          <div className="stats-row">
            <div><span>Repos</span><strong>{formatStars(filteredStats?.repoCount || 0)}</strong></div>
            <div><span>Links</span><strong>{formatStars(filteredStats?.linkCount || 0)}</strong></div>
            <div><span>Total stars</span><strong>{formatStars(filteredStats?.stars || 0)}</strong></div>
          </div>
          <div className="legend-row">
            {Object.entries(CATEGORY_COLORS).filter(([key]) => key !== 'Other').map(([label, color]) => (
              <div key={label} className="legend-item"><span style={{ background: color }} />{label}</div>
            ))}
          </div>
          <div className="graph-wrap">
            {filteredGraph ? (
              <ForceGraph2D
                ref={graphRef}
                graphData={filteredGraph}
                backgroundColor="#020817"
                nodeRelSize={5}
                cooldownTicks={100}
                linkColor={(link) => highlightedIds.has(typeof link.source === 'string' ? link.source : link.source.id) && highlightedIds.has(typeof link.target === 'string' ? link.target : link.target.id) ? 'rgba(148,163,184,0.45)' : 'rgba(71,85,105,0.15)'}
                linkWidth={(link) => {
                  const source = typeof link.source === 'string' ? link.source : link.source.id
                  const target = typeof link.target === 'string' ? link.target : link.target.id
                  return highlightedIds.has(source) && highlightedIds.has(target) ? 1.5 : 0.5
                }}
                nodeVal={(node) => node.size}
                nodeColor={(node) => CATEGORY_COLORS[node.primary_category] || CATEGORY_COLORS.Other}
                onNodeClick={(node) => focusNode(node)}
                nodeCanvasObject={(node, ctx, scale) => {
                  const isSelected = node.id === selectedId
                  const isNeighbor = highlightedIds.has(node.id)
                  const radius = Math.max(3, node.size)

                  ctx.beginPath()
                  ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false)
                  ctx.fillStyle = CATEGORY_COLORS[node.primary_category] || CATEGORY_COLORS.Other
                  ctx.fill()

                  if (isNeighbor) {
                    ctx.strokeStyle = isSelected ? '#f8fafc' : 'rgba(248,250,252,0.55)'
                    ctx.lineWidth = isSelected ? 2.5 : 1
                    ctx.stroke()
                  }

                  if (isSelected || (isNeighbor && scale > 3.2)) {
                    const label = node.id
                    const fontSize = isSelected ? 13 / scale : 10 / scale
                    ctx.font = `${fontSize}px Inter, sans-serif`
                    ctx.fillStyle = '#e2e8f0'
                    ctx.fillText(label, node.x + radius + 2, node.y + radius + 2)
                  }
                }}
              />
            ) : (
              <div className="loading">로딩 중...</div>
            )}
          </div>
        </section>

        <aside className="detail-panel card">
          {selectedNode ? (
            <>
              <div className="detail-top">
                <div className="eyebrow">Selected repository</div>
                <h2>{selectedNode.id}</h2>
                <a href={selectedNode.html_url} target="_blank" rel="noreferrer">GitHub에서 열기</a>
              </div>
              <p className="description">{selectedNode.description || '설명이 없습니다.'}</p>
              <dl className="detail-grid">
                <div><dt>Stars</dt><dd>{formatStars(selectedNode.stars)}</dd></div>
                <div><dt>Language</dt><dd>{selectedNode.language || '-'}</dd></div>
                <div><dt>Primary</dt><dd>{selectedNode.primary_category}</dd></div>
                <div><dt>Updated</dt><dd>{formatKST(selectedNode.updated_at)}</dd></div>
              </dl>
              <div className="tag-block">
                <h3>Categories</h3>
                <div className="tag-list">
                  {selectedNode.categories?.map((item) => <span key={item} className="tag">{item}</span>)}
                </div>
              </div>
              <div className="tag-block">
                <h3>Topics</h3>
                <div className="tag-list">
                  {(selectedNode.topics?.length ? selectedNode.topics : ['none']).map((item) => <span key={item} className="tag muted-tag">{item}</span>)}
                </div>
              </div>
              <div className="related-block">
                <h3>Related repositories</h3>
                <ul>
                  {filteredGraph?.links
                    .filter((link) => {
                      const source = typeof link.source === 'string' ? link.source : link.source.id
                      const target = typeof link.target === 'string' ? link.target : link.target.id
                      return source === selectedNode.id || target === selectedNode.id
                    })
                    .slice(0, 12)
                    .map((link) => {
                      const source = typeof link.source === 'string' ? link.source : link.source.id
                      const target = typeof link.target === 'string' ? link.target : link.target.id
                      const targetId = source === selectedNode.id ? target : source
                      return (
                        <li key={`${source}-${target}`}>
                          <button onClick={() => focusNode(filteredGraph.nodes.find((node) => node.id === targetId))}>{targetId}</button>
                          <span>score {link.weight.toFixed(1)}</span>
                        </li>
                      )
                    })}
                </ul>
              </div>
            </>
          ) : (
            <div className="loading">저장소를 선택하면 상세 정보가 표시됩니다.</div>
          )}
        </aside>
      </main>
    </div>
  )
}
