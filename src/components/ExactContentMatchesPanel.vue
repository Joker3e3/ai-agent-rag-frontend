<script setup>
import { computed } from 'vue'
import {
  getExactContentMatchCounts,
  getExactContentPreview,
} from '../services/ragSources'

const props = defineProps({
  matches: {
    type: Object,
    required: true,
  },
})

const items = computed(() => (
  Array.isArray(props.matches?.items) ? props.matches.items : []
))

const query = computed(() => props.matches?.query || props.matches?.query_term || '未提供')

const hasDirectEvidence = (item) => (
  item && typeof item === 'object' && [
    'page',
    'section',
    'chunk_index',
    'content_preview',
    'content',
    'content_truncated',
    'chunk_id',
  ].some(field => item[field] !== null && item[field] !== undefined)
)

const getEvidence = (item) => (
  Array.isArray(item?.evidence) && item.evidence.length
    ? item.evidence
    : hasDirectEvidence(item) ? [item] : []
)

const documentGroups = computed(() => {
  const groups = []
  const groupsByDocumentId = new Map()

  items.value.forEach((item, index) => {
    const documentId = String(item?.document_id ?? '').trim()
    const evidence = getEvidence(item)

    if (!documentId || !item || typeof item !== 'object') {
      groups.push({
        ...(item && typeof item === 'object' ? item : {}),
        document_id: item?.document_id,
        evidence,
        key: `missing-document-${index}`,
      })
      return
    }

    let group = groupsByDocumentId.get(documentId)
    if (!group) {
      group = {
        ...item,
        evidence: [...evidence],
        key: `document-${documentId}`,
      }
      groupsByDocumentId.set(documentId, group)
      groups.push(group)
      return
    }

    group.evidence.push(...evidence)
  })

  return groups
})

const matchCounts = computed(() => getExactContentMatchCounts(props.matches))

const getDocumentKey = (group, index) => (
  group?.key || `${group?.document_id || 'missing-document'}-${index}`
)

const isContentTruncated = (evidence, group) => (
  evidence?.content_truncated === true || group?.content_truncated === true
)
</script>

<template>
  <section class="exact-content-matches-panel" aria-label="正文匹配文档">
    <div class="exact-panel-header">
      <div>
        <div class="exact-panel-title">正文匹配文档</div>
        <div class="exact-panel-query">问题：{{ query }}</div>
      </div>
      <el-tag type="success" effect="light">正文精确匹配</el-tag>
    </div>

    <div class="exact-match-counts" aria-label="正文匹配统计">
      <span>命中块：{{ matchCounts.matched_chunk_count }}</span>
      <span>已展示证据：{{ matchCounts.displayed_evidence_count }}</span>
      <span>省略证据：{{ matchCounts.omitted_evidence_count }}</span>
    </div>

    <div v-if="documentGroups.length" class="exact-document-list">
      <article
        v-for="(group, index) in documentGroups"
        :key="getDocumentKey(group, index)"
        class="exact-document-item"
      >
        <div class="exact-document-heading">
          <span class="exact-document-filename">{{ group.filename || '未命名文档' }}</span>
          <el-tag type="info" effect="plain">{{ group.document_type || 'document' }}</el-tag>
        </div>
        <div class="exact-document-id">document_id: {{ group.document_id || '未提供' }}</div>

        <details v-if="group.evidence.length" class="exact-evidence-details">
          <summary class="exact-evidence-summary">
            证据片段（{{ group.evidence.length }}）
          </summary>
          <div class="exact-evidence-list">
            <div
              v-for="(evidence, evidenceIndex) in group.evidence"
              :key="`${evidence.chunk_id || 'evidence'}-${evidenceIndex}`"
              class="exact-evidence-item"
            >
              <div class="exact-evidence-meta">
                <span>页码：{{ evidence.page ?? '未提供' }}</span>
                <span>section：{{ evidence.section || '未提供' }}</span>
                <span>chunk_index：{{ evidence.chunk_index ?? '未提供' }}</span>
              </div>
              <div class="exact-content-preview">
                {{ getExactContentPreview(evidence) || '未提供正文预览' }}
              </div>
              <el-tag v-if="isContentTruncated(evidence, group)" type="warning" effect="light">
                证据片段已截断
              </el-tag>
            </div>
          </div>
        </details>
        <div v-else class="exact-evidence-empty">暂无证据片段</div>
      </article>
    </div>

    <div v-else class="exact-panel-empty">未找到正文精确匹配</div>
  </section>
</template>

<style scoped>
.exact-content-matches-panel {
  margin-top: 10px;
  color: #344054;
  font-size: 14px;
  line-height: 1.5;
}

.exact-panel-header,
.exact-document-heading,
.exact-evidence-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.exact-panel-header {
  justify-content: space-between;
  margin-bottom: 8px;
}

.exact-match-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-bottom: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #f8fafc;
  color: #475467;
  font-size: 12px;
}

.exact-panel-title {
  font-weight: 700;
}

.exact-panel-query,
.exact-document-id,
.exact-evidence-meta {
  color: #667085;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.exact-document-list {
  display: grid;
  gap: 8px;
}

.exact-document-item,
.exact-panel-empty {
  padding: 10px 12px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #fcfcfd;
}

.exact-document-heading {
  flex-wrap: wrap;
}

.exact-document-filename {
  min-width: 0;
  overflow: hidden;
  color: #1677ff;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.exact-evidence-list {
  display: grid;
  gap: 8px;
  margin-top: 8px;
}

.exact-evidence-details {
  margin-top: 8px;
}

.exact-evidence-summary {
  cursor: pointer;
  color: #475467;
  font-weight: 600;
}

.exact-evidence-item {
  padding: 8px;
  border-radius: 6px;
  background: #f2f4f7;
}

.exact-evidence-meta {
  flex-wrap: wrap;
}

.exact-content-preview {
  margin: 8px 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.exact-evidence-empty {
  margin-top: 8px;
  padding: 8px;
  border-radius: 6px;
  background: #f8fafc;
  color: #667085;
  font-size: 12px;
}
</style>
