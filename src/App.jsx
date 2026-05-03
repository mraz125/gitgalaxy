import React, { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import {
  filterGraph,
  findRepoByQuery,
  getCategoryCounts,
  getEndpointId,
  getFeaturedRepositories,
  getLanguageCounts,
  getRelatedRepositories,
  getSearchMatches,
} from './graphUtils'

const CATEGORY_COLORS = {
  'LLM': '#d7b56d',
  'Agents': '#6ee7b7',
  'RAG': '#67e8f9',
  'Inference': '#fb923c',
  'Fine-tuning': '#f87171',
  'Evaluation': '#fde047',
  'AI Apps': '#93c5fd',
  'Multimodal': '#f0abfc',
  'Other': '#a1a1aa',
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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function scaleLogValue(value, domainMin, domainMax, rangeMin, rangeMax) {
  const safeValue = Math.max(1, value || 1)
  const safeMin = Math.max(1, domainMin || 1)
  const safeMax = Math.max(safeMin + 1, domainMax || safeMin + 1)
  const ratio = (Math.log10(safeValue) - Math.log10(safeMin)) / (Math.log10(safeMax) - Math.log10(safeMin))
  const normalized = clamp(Number.isFinite(ratio) ? ratio : 0, 0, 1)

  return rangeMin + normalized * (rangeMax - rangeMin)
}

export default function App() {
  const graphRef = useRef(null)
  const [graph, setGraph] = useState(null)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [activeLanguage, setActiveLanguage] = useState('All')
  const [minStars, setMinStars] = useState(0)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/graph.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        setGraph(data)
        setMinStars(data.min_stars || 0)
        if (data.nodes?.length) {
          setSelectedId(data.nodes[0].id)
        }
      })
      .catch((error) => setMessage(`데이터 로드 실패: ${error.message}`))
  }, [])

  const categoryCounts = useMemo(() => getCategoryCounts(graph?.nodes || []), [graph])
  const languageCounts = useMemo(() => getLanguageCounts(graph?.nodes || []), [graph])
  const maxStars = useMemo(() => Math.max(...(graph?.nodes || []).map((node) => node.stars || 0), 1000), [graph])

  const filteredGraph = useMemo(
    () => filterGraph(graph, { category: activeCategory, language: activeLanguage, minStars }),
    [activeCategory, activeLanguage, graph, minStars],
  )

  const neighborMap = useMemo(() => {
    const map = new Map()
    if (!filteredGraph) return map

    filteredGraph.nodes.forEach((node) => map.set(node.id, new Set([node.id])))
    filteredGraph.links.forEach((link) => {
      const source = getEndpointId(link.source)
      const target = getEndpointId(link.target)
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

  useEffect(() => {
    if (!filteredGraph?.nodes?.length) {
      setSelectedId('')
      return
    }
    if (!filteredGraph.nodes.some((node) => node.id === selectedId)) {
      setSelectedId(filteredGraph.nodes[0].id)
    }
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

  const searchMatches = useMemo(() => getSearchMatches(filteredGraph?.nodes || [], query), [filteredGraph, query])
  const relatedRepositories = useMemo(
    () => getRelatedRepositories(filteredGraph, selectedNode?.id, 12),
    [filteredGraph, selectedNode],
  )
  const featuredRepositories = useMemo(() => getFeaturedRepositories(filteredGraph, 5), [filteredGraph])

  const graphRanges = useMemo(() => {
    if (!filteredGraph?.nodes?.length) {
      return {
        minStars: 500,
        maxStars: 5000,
        minWeight: 1,
        maxWeight: 10,
      }
    }

    const stars = filteredGraph.nodes.map((node) => node.stars || 0)
    const weights = filteredGraph.links?.length ? filteredGraph.links.map((link) => link.weight || 1) : [1]

    return {
      minStars: Math.min(...stars),
      maxStars: Math.max(...stars),
      minWeight: Math.min(...weights),
      maxWeight: Math.max(...weights),
    }
  }, [filteredGraph])

  const getNodeRadius = (node) => scaleLogValue(node.stars, graphRanges.minStars, graphRanges.maxStars, 4, 18)

  const getLinkWidth = (link, isHighlighted) => {
    const width = scaleLogValue(link.weight || 1, graphRanges.minWeight, graphRanges.maxWeight, 0.7, 2.2)
    return isHighlighted ? width * 1.8 : width
  }

  const getLinkColor = (link, isHighlighted) => {
    const opacity = scaleLogValue(link.weight || 1, graphRanges.minWeight, graphRanges.maxWeight, 0.18, 0.42)
    return isHighlighted
      ? `rgba(191, 219, 254, ${Math.min(opacity + 0.3, 0.88)})`
      : `rgba(96, 165, 250, ${opacity})`
  }

  const focusNode = (node) => {
    if (!node || !graphRef.current) return
    setSelectedId(node.id)
    graphRef.current.centerAt(node.x || 0, node.y || 0, 450)
    graphRef.current.zoom(5, 450)
  }

  const fitGraph = () => {
    graphRef.current?.zoomToFit(450, 42)
  }

  const resetFilters = () => {
    setActiveCategory('All')
    setActiveLanguage('All')
    setMinStars(graph?.min_stars || 0)
    setMessage('')
  }

  const runSearch = () => {
    if (!query.trim()) {
      setMessage('저장소 이름 또는 GitHub URL을 입력해 주세요.')
      return
    }

    const node = findRepoByQuery(filteredGraph?.nodes || [], query)
    if (!node) {
      setMessage('현재 필터 범위에서 정확히 하나의 저장소를 찾지 못했습니다. 아래 추천 결과를 선택하거나 필터를 완화해 주세요.')
      return
    }

    setMessage('')
    focusNode(node)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">Repository intelligence map</div>
          <h1>GitGalaxy</h1>
          <p className="subtitle">AI 오픈소스 저장소를 별 수, 분류, 언어, 관계 강도로 빠르게 탐색합니다.</p>
        </div>
        <div className="snapshot-card">
          <div>업데이트 시각</div>
          <strong>{formatKST(graph?.generated_at)}</strong>
          <div className="muted">기본 편입 기준: stars ≥ 500</div>
        </div>
      </header>

      <section className="controls">
        <div className="searchbar">
          <label className="field">
            <span>저장소 검색</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && runSearch()}
              placeholder="owner/repo, 저장소 이름, GitHub URL"
            />
          </label>
          <button className="primary-action" onClick={runSearch}>검색</button>
          <button className="ghost-action" onClick={fitGraph}>전체 보기</button>
          <button className="ghost-action" onClick={resetFilters}>초기화</button>
        </div>
        {searchMatches.length ? (
          <div className="search-results" aria-label="Search suggestions">
            {searchMatches.map((node) => (
              <button key={node.id} onClick={() => {
                setMessage('')
                setQuery(node.id)
                focusNode(node)
              }}>
                <strong>{node.id}</strong>
                <span>{formatStars(node.stars)} stars</span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="filter-bar">
          <label className="select-control">
            <span>카테고리</span>
            <select value={activeCategory} onChange={(event) => setActiveCategory(event.target.value)}>
              {categoryCounts.map(([category, count]) => (
                <option key={category} value={category}>{category} ({formatStars(count)})</option>
              ))}
            </select>
          </label>
          <label className="select-control">
            <span>언어</span>
            <select value={activeLanguage} onChange={(event) => setActiveLanguage(event.target.value)}>
              {languageCounts.map(([language, count]) => (
                <option key={language} value={language}>{language} ({formatStars(count)})</option>
              ))}
            </select>
          </label>
          <label className="range-control">
            <span>최소 stars <strong>{formatStars(minStars)}</strong></span>
            <input
              type="range"
              min={graph?.min_stars || 0}
              max={maxStars}
              step="500"
              value={minStars}
              onChange={(event) => setMinStars(Number(event.target.value))}
            />
          </label>
        </div>
        {message ? <div className="message" role="status">{message}</div> : null}
        <div className="featured-strip" aria-label="현재 조건의 추천 저장소">
          <div className="featured-heading">
            <span>현재 조건 상위 저장소</span>
            <strong>{featuredRepositories.length ? `${featuredRepositories.length}개` : '없음'}</strong>
          </div>
          <div className="featured-list">
            {featuredRepositories.map((node) => (
              <button key={node.id} onClick={() => focusNode(node)}>
                <span>{node.primary_category}</span>
                <strong>{node.id}</strong>
                <small>{formatStars(node.stars)} stars</small>
              </button>
            ))}
          </div>
        </div>
      </section>

      <main className="main-grid">
        <section className="graph-panel panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">Interactive map</div>
              <h2>저장소 관계 그래프</h2>
            </div>
            <div className="stats-row">
              <div><span>Repos</span><strong>{formatStars(filteredStats?.repoCount || 0)}</strong></div>
              <div><span>Links</span><strong>{formatStars(filteredStats?.linkCount || 0)}</strong></div>
              <div><span>Total stars</span><strong>{formatStars(filteredStats?.stars || 0)}</strong></div>
            </div>
          </div>
          <div className="graph-toolbar">
            <div>
              <strong>{selectedNode?.id || '저장소를 선택하세요'}</strong>
              <span>{selectedNode ? `${formatStars(selectedNode.stars)} stars · ${selectedNode.primary_category}` : '검색하거나 그래프의 점을 클릭하면 연결 저장소가 강조됩니다.'}</span>
            </div>
            <button className="ghost-action" onClick={fitGraph}>그래프 맞춤</button>
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
                backgroundColor="#050505"
                nodeRelSize={6}
                cooldownTicks={100}
                linkColor={(link) => {
                  const source = getEndpointId(link.source)
                  const target = getEndpointId(link.target)
                  const isHighlighted = highlightedIds.has(source) && highlightedIds.has(target)
                  return getLinkColor(link, isHighlighted)
                }}
                linkWidth={(link) => {
                  const source = getEndpointId(link.source)
                  const target = getEndpointId(link.target)
                  const isHighlighted = highlightedIds.has(source) && highlightedIds.has(target)
                  return getLinkWidth(link, isHighlighted)
                }}
                nodeVal={(node) => getNodeRadius(node)}
                nodeColor={(node) => CATEGORY_COLORS[node.primary_category] || CATEGORY_COLORS.Other}
                onNodeClick={(node) => focusNode(node)}
                nodeCanvasObject={(node, ctx, scale) => {
                  const isSelected = node.id === selectedId
                  const isNeighbor = highlightedIds.has(node.id)
                  const radius = getNodeRadius(node)

                  ctx.beginPath()
                  ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false)
                  ctx.fillStyle = CATEGORY_COLORS[node.primary_category] || CATEGORY_COLORS.Other
                  ctx.fill()

                  if (isNeighbor) {
                    ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(245,245,245,0.5)'
                    ctx.lineWidth = isSelected ? 2.5 : 1
                    ctx.stroke()
                  }

                  if (isSelected || (isNeighbor && scale > 3.2)) {
                    const label = node.id
                    const fontSize = isSelected ? 13 / scale : 10 / scale
                    ctx.font = `${fontSize}px Inter, sans-serif`
                    ctx.fillStyle = '#fafafa'
                    ctx.fillText(label, node.x + radius + 2, node.y + radius + 2)
                  }
                }}
              />
            ) : (
              <div className="loading">로딩 중...</div>
            )}
          </div>
        </section>

        <aside className="detail-panel panel">
          {selectedNode ? (
            <>
              <div className="detail-top">
                <div className="eyebrow">Selected repository</div>
                <h2>{selectedNode.id}</h2>
                <a href={selectedNode.html_url} target="_blank" rel="noreferrer">Open on GitHub</a>
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
                  {relatedRepositories.map((item) => (
                    <li key={`${item.source}-${item.target}`}>
                      <button onClick={() => focusNode(item.node)}>{item.node.id}</button>
                      <span>score {item.weight.toFixed(1)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <div className="loading">필터 조건에 맞는 저장소가 없습니다.</div>
          )}
        </aside>
      </main>
    </div>
  )
}
