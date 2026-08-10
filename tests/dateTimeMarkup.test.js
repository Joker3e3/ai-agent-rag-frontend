import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const careerMarkup = await readFile(new URL('../src/views/CareerAgent.vue', import.meta.url), 'utf8')
const rollupMarkup = await readFile(new URL('../src/components/TopicRollupPanel.vue', import.meta.url), 'utf8')
const topicMarkup = await readFile(new URL('../src/components/TopicTopicsPanel.vue', import.meta.url), 'utf8')

test('all visible application timestamps use the shared formatter', () => {
  assert.match(careerMarkup, /formatDateTime/)
  assert.match(rollupMarkup, /formatDateTime\(row\.created_at\)/)
  assert.match(rollupMarkup, /formatDateTime\(row\.finished_at\)/)
  assert.match(topicMarkup, /formatDateTime\(row\.updated_at\)/)
})
