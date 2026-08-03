import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const viewMarkup = await readFile(new URL('../src/views/RagChatView.vue', import.meta.url), 'utf8')

test('source cards use a collapsed clickable filename summary', () => {
  assert.match(viewMarkup, /<details[^>]*class="source-item"[^>]*>/)
  assert.match(viewMarkup, /<summary class="source-filename"[^>]*>\s*\{\{ source\.filename \}\}/)
})
