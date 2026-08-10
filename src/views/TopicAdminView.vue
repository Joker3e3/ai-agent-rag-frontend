<script setup>
import { ref } from 'vue'
import axios from 'axios'

import TopicCandidatesPanel from '../components/TopicCandidatesPanel.vue'
import TopicRelationsPanel from '../components/TopicRelationsPanel.vue'
import TopicRollupPanel from '../components/TopicRollupPanel.vue'
import TopicTopicsPanel from '../components/TopicTopicsPanel.vue'
import { createTopicTaxonomyApi } from '../services/topicTaxonomyAdmin'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
const api = createTopicTaxonomyApi({ client: axios, baseUrl: API_BASE_URL })

const activeTab = ref('candidates')
const loadedTabs = ref(new Set(['candidates']))
const taxonomyVersion = ref('')
const userId = ref('Joker3e')

const handleTabChange = (tabName) => {
  loadedTabs.value = new Set([...loadedTabs.value, tabName])
}

const handleTaxonomyVersion = (value) => {
  taxonomyVersion.value = value
}

const handleUserIdUpdate = (value) => {
  userId.value = value
}
</script>

<template>
  <main class="topic-admin-page">
    <section class="topic-admin-hero">
      <div>
        <p class="topic-admin-kicker">TOPIC TAXONOMY ADMIN</p>
        <h1>主题治理</h1>
        <p class="topic-admin-subtitle">
          审核候选主题与父子关系，执行 parent rollup，并管理继承分配批次。
        </p>
      </div>
      <el-tag type="warning" effect="light">MVP 测试模式</el-tag>
    </section>

    <el-alert
      type="info"
      :closable="false"
      title="当前页面使用固定测试管理员请求头；所有状态以服务端响应为准。"
      class="topic-admin-notice"
    />

    <el-tabs v-model="activeTab" type="border-card" @tab-change="handleTabChange">
      <el-tab-pane label="候选主题" name="candidates">
        <TopicCandidatesPanel :api="api" :active="activeTab === 'candidates'" />
      </el-tab-pane>
      <el-tab-pane label="父子关系" name="relations">
        <TopicRelationsPanel
          v-if="loadedTabs.has('relations')"
          :api="api"
          :active="activeTab === 'relations'"
          @taxonomy-version="handleTaxonomyVersion"
        />
        <div v-else class="tab-placeholder">切换到此 Tab 后加载父子关系列表。</div>
      </el-tab-pane>
      <el-tab-pane label="Rollup 与批次回滚" name="rollup">
        <TopicRollupPanel
          v-if="loadedTabs.has('rollup')"
          :api="api"
          :active="activeTab === 'rollup'"
          :taxonomy-version="taxonomyVersion"
          :user-id="userId"
          @update:user-id="handleUserIdUpdate"
        />
        <div v-else class="tab-placeholder">切换到此 Tab 后加载 Rollup 历史批次。</div>
      </el-tab-pane>
      <el-tab-pane label="主题列表" name="topics">
        <TopicTopicsPanel
          v-if="loadedTabs.has('topics')"
          :api="api"
          :active="activeTab === 'topics'"
        />
        <div v-else class="tab-placeholder">切换到此 Tab 后加载主题历史和已激活主题。</div>
      </el-tab-pane>
    </el-tabs>
  </main>
</template>

<style scoped>
.topic-admin-page {
  min-width: 0;
}

.topic-admin-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 16px;
  border: 1px solid #d0d5dd;
  border-radius: 14px;
  background: #fff;
  padding: 22px 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
}

.topic-admin-kicker {
  margin: 0 0 6px;
  color: #175cd3;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.topic-admin-hero h1 {
  margin: 0;
  color: #101828;
  font-size: 28px;
}

.topic-admin-subtitle {
  margin: 8px 0 0;
  color: #667085;
  line-height: 1.6;
}

.topic-admin-notice {
  margin-bottom: 16px;
}

.tab-placeholder {
  min-height: 220px;
  display: grid;
  place-items: center;
  color: #667085;
}

@media (max-width: 760px) {
  .topic-admin-hero {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
