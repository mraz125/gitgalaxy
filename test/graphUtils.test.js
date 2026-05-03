import test from 'node:test'
import assert from 'node:assert/strict'

import {
  filterGraphByCategory,
  findRepoByQuery,
  getCategoryCounts,
  getRelatedRepositories,
  normalizeRepoQuery,
} from '../src/graphUtils.js'

const graph = {
  generated_at: '2026-05-02T09:28:03.257061+00:00',
  nodes: [
    {
      id: 'openai/openai-cookbook',
      name: 'openai-cookbook',
      owner: 'openai',
      stars: 64000,
      language: 'MDX',
      categories: ['LLM', 'AI Apps'],
      primary_category: 'LLM',
    },
    {
      id: 'langchain-ai/langchain',
      name: 'langchain',
      owner: 'langchain-ai',
      stars: 112000,
      language: 'Python',
      categories: ['Agents', 'RAG'],
      primary_category: 'Agents',
    },
    {
      id: 'vllm-project/vllm',
      name: 'vllm',
      owner: 'vllm-project',
      stars: 47000,
      language: 'Python',
      categories: ['Inference'],
      primary_category: 'Inference',
    },
  ],
  links: [
    { source: { id: 'openai/openai-cookbook' }, target: { id: 'langchain-ai/langchain' }, weight: 7.2 },
    { source: { id: 'langchain-ai/langchain' }, target: { id: 'vllm-project/vllm' }, weight: 4.1 },
  ],
}

test('normalizeRepoQuery accepts GitHub URLs and owner/repo values', () => {
  assert.equal(normalizeRepoQuery('https://github.com/OpenAI/openai-cookbook/'), 'openai/openai-cookbook')
  assert.equal(normalizeRepoQuery('github.com/langchain-ai/langchain'), 'langchain-ai/langchain')
  assert.equal(normalizeRepoQuery('  vllm-project/vllm  '), 'vllm-project/vllm')
})

test('filterGraphByCategory keeps links after force graph mutates endpoints into node objects', () => {
  const filtered = filterGraphByCategory(graph, 'Agents')

  assert.deepEqual(filtered.nodes.map((node) => node.id), ['langchain-ai/langchain'])
  assert.deepEqual(filtered.links, [])

  const all = filterGraphByCategory(graph, 'All')
  assert.equal(all.links.length, 2)
})

test('getCategoryCounts returns category totals sorted by name with All first', () => {
  assert.deepEqual(getCategoryCounts(graph.nodes), [
    ['All', 3],
    ['AI Apps', 1],
    ['Agents', 1],
    ['Inference', 1],
    ['LLM', 1],
    ['RAG', 1],
  ])
})

test('findRepoByQuery supports exact IDs, GitHub URLs, and unique partial matches', () => {
  assert.equal(findRepoByQuery(graph.nodes, 'https://github.com/vllm-project/vllm')?.id, 'vllm-project/vllm')
  assert.equal(findRepoByQuery(graph.nodes, 'openai-cookbook')?.id, 'openai/openai-cookbook')
  assert.equal(findRepoByQuery(graph.nodes, 'python'), null)
})

test('getRelatedRepositories sorts selected neighbors by score', () => {
  const related = getRelatedRepositories(graph, 'langchain-ai/langchain')

  assert.deepEqual(related.map((item) => [item.node.id, item.weight]), [
    ['openai/openai-cookbook', 7.2],
    ['vllm-project/vllm', 4.1],
  ])
})
