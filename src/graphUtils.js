export function normalizeRepoQuery(input) {
  const trimmed = String(input || '').trim()
  if (!trimmed) return ''

  try {
    const url = new URL(trimmed)
    if (url.hostname.includes('github.com')) {
      const parts = url.pathname.split('/').filter(Boolean)
      if (parts.length >= 2) return `${parts[0]}/${parts[1]}`.toLowerCase()
    }
  } catch {
    // Keep plain owner/repo values on the fast path.
  }

  return trimmed.replace(/^github\.com\//i, '').replace(/\/$/, '').toLowerCase()
}

export function getEndpointId(endpoint) {
  if (!endpoint) return ''
  if (typeof endpoint === 'string') return endpoint
  return endpoint.id || ''
}

export function filterGraphByCategory(graph, activeCategory = 'All') {
  if (!graph) return null
  if (activeCategory === 'All') return graph

  const allowed = new Set(
    graph.nodes.filter((node) => node.categories?.includes(activeCategory)).map((node) => node.id),
  )

  return {
    ...graph,
    nodes: graph.nodes.filter((node) => allowed.has(node.id)),
    links: graph.links.filter((link) => allowed.has(getEndpointId(link.source)) && allowed.has(getEndpointId(link.target))),
  }
}

export function filterGraph(graph, { category = 'All', language = 'All', minStars = 0 } = {}) {
  if (!graph) return null

  const categoryGraph = filterGraphByCategory(graph, category)
  const allowed = new Set(
    categoryGraph.nodes
      .filter((node) => language === 'All' || (node.language || 'Unknown') === language)
      .filter((node) => (node.stars || 0) >= minStars)
      .map((node) => node.id),
  )

  return {
    ...categoryGraph,
    nodes: categoryGraph.nodes.filter((node) => allowed.has(node.id)),
    links: categoryGraph.links.filter((link) => allowed.has(getEndpointId(link.source)) && allowed.has(getEndpointId(link.target))),
  }
}

export function getCategoryCounts(nodes = []) {
  const counts = new Map([['All', nodes.length]])
  for (const node of nodes) {
    for (const category of node.categories || []) {
      counts.set(category, (counts.get(category) || 0) + 1)
    }
  }

  return [...counts.entries()].sort(([left], [right]) => {
    if (left === 'All') return -1
    if (right === 'All') return 1
    return left < right ? -1 : left > right ? 1 : 0
  })
}

export function getLanguageCounts(nodes = [], limit = 8) {
  const counts = new Map()
  for (const node of nodes) {
    const language = node.language || 'Unknown'
    counts.set(language, (counts.get(language) || 0) + 1)
  }

  return [['All', nodes.length], ...[...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit)]
}

export function findRepoByQuery(nodes = [], input = '') {
  const normalized = normalizeRepoQuery(input)
  if (!normalized) return null

  const exact = nodes.find((node) => node.id.toLowerCase() === normalized)
  if (exact) return exact

  const matches = nodes.filter((node) => {
    const fields = [
      node.id,
      node.name,
      node.owner,
      node.language,
      ...(node.topics || []),
      ...(node.categories || []),
    ].map((value) => String(value || '').toLowerCase())

    return fields.some((value) => value.includes(normalized))
  })

  return matches.length === 1 ? matches[0] : null
}

export function getSearchMatches(nodes = [], input = '', limit = 8) {
  const normalized = normalizeRepoQuery(input)
  if (!normalized) return []

  return nodes
    .filter((node) => {
      const id = node.id.toLowerCase()
      const name = node.name.toLowerCase()
      return id.includes(normalized) || name.includes(normalized)
    })
    .sort((left, right) => {
      const leftExact = left.id.toLowerCase() === normalized ? 1 : 0
      const rightExact = right.id.toLowerCase() === normalized ? 1 : 0
      return rightExact - leftExact || (right.stars || 0) - (left.stars || 0) || left.id.localeCompare(right.id)
    })
    .slice(0, limit)
}

export function getFeaturedRepositories(graph, limit = 5) {
  if (!graph?.nodes?.length) return []

  return [...graph.nodes]
    .sort((left, right) => (right.stars || 0) - (left.stars || 0) || left.id.localeCompare(right.id))
    .slice(0, limit)
}

export function getRelatedRepositories(graph, selectedId, limit = 12) {
  if (!graph || !selectedId) return []

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]))
  return graph.links
    .map((link) => {
      const source = getEndpointId(link.source)
      const target = getEndpointId(link.target)
      if (source !== selectedId && target !== selectedId) return null
      const targetId = source === selectedId ? target : source
      const node = nodesById.get(targetId)
      return node ? { node, weight: Number(link.weight || 0), source, target } : null
    })
    .filter(Boolean)
    .sort((left, right) => right.weight - left.weight || left.node.id.localeCompare(right.node.id))
    .slice(0, limit)
}
