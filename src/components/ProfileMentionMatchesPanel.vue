<script setup>
import { computed } from 'vue'

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

const topicLabel = computed(() => (
  props.matches?.topic?.topic_label || props.matches?.topic?.topic_code || '未识别主题'
))

const getTopics = (item) => {
  if (Array.isArray(item?.matched_topics)) return item.matched_topics
  if (Array.isArray(item?.topics)) return item.topics
  return []
}

const getDocumentKey = (item, index) => (
  `${item?.document_id || 'missing-document'}-${index}`
)
</script>

<template>
  <section class="profile-mention-matches-panel" aria-label="画像提及文档">
    <div class="profile-panel-header">
      <div>
        <div class="profile-panel-title">画像提及文档</div>
        <div class="profile-panel-query">问题：{{ query }}</div>
      </div>
      <el-tag type="warning" effect="light">画像提及</el-tag>
    </div>

    <div class="profile-panel-note">画像提及不等同于正文出现</div>

    <div class="profile-panel-topic">
      <span class="profile-panel-label">主题</span>
      <span>{{ topicLabel }}</span>
      <span v-if="matches.topic?.topic_code" class="profile-panel-code">
        {{ matches.topic.topic_code }}
      </span>
    </div>

    <div v-if="items.length" class="profile-document-list">
      <article
        v-for="(item, index) in items"
        :key="getDocumentKey(item, index)"
        class="profile-document-item"
      >
        <div class="profile-document-heading">
          <span class="profile-document-filename">{{ item.filename || '未命名文档' }}</span>
          <el-tag type="info" effect="plain">{{ item.document_type || 'document' }}</el-tag>
        </div>
        <div class="profile-document-id">document_id: {{ item.document_id || '未提供' }}</div>

        <div v-if="getTopics(item).length" class="profile-assignment-list">
          <div class="profile-assignment-title">画像提及信息</div>
          <div
            v-for="(topic, topicIndex) in getTopics(item)"
            :key="`${topic.topic_code || 'topic'}-${topicIndex}`"
            class="profile-assignment"
          >
            <span>{{ topic.topic_label || topic.topic_code || '未命名主题' }}</span>
            <el-tag size="small" type="warning">
              {{ topic.topic_role || 'mention_only' }}
            </el-tag>
            <el-tag size="small" type="info" effect="plain">
              {{ topic.assignment_kind || 'mention' }}
            </el-tag>
          </div>
        </div>
      </article>
    </div>

    <div v-else class="profile-panel-empty">未找到画像提及该主题的文档</div>
  </section>
</template>

<style scoped>
.profile-mention-matches-panel {
  margin-top: 10px;
  color: #344054;
  font-size: 14px;
  line-height: 1.5;
}

.profile-panel-header,
.profile-document-heading,
.profile-assignment {
  display: flex;
  align-items: center;
  gap: 8px;
}

.profile-panel-header {
  justify-content: space-between;
  margin-bottom: 8px;
}

.profile-panel-title,
.profile-panel-label,
.profile-assignment-title {
  font-weight: 700;
}

.profile-panel-query,
.profile-document-id,
.profile-panel-code {
  color: #667085;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.profile-panel-note,
.profile-panel-topic,
.profile-panel-empty {
  margin-bottom: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fff8eb;
}

.profile-panel-note {
  color: #7a4b00;
}

.profile-panel-topic {
  display: flex;
  gap: 8px;
}

.profile-document-list {
  display: grid;
  gap: 8px;
}

.profile-document-item {
  padding: 10px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #fcfcfd;
}

.profile-document-heading {
  flex-wrap: wrap;
}

.profile-document-filename {
  min-width: 0;
  overflow: hidden;
  color: #1677ff;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-assignment-list {
  display: grid;
  gap: 5px;
  margin-top: 8px;
}

.profile-assignment {
  flex-wrap: wrap;
  padding: 6px 8px;
  border-radius: 6px;
  background: #f2f4f7;
}
</style>
