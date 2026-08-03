<script setup>
import { nextTick } from 'vue'
import { ref } from 'vue'
import { onMounted } from 'vue'

import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  buildSourcesHistoryPayload,
  createAssistantMessage,
  getRequestIdFromResponse,
  getSourcesHistoryErrorMessage,
  getSourcesHistoryState,
} from '../services/ragSources'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
const USER_ID = 'Joker3e'

onMounted(() => { loadDocuments() })

let pollingTimer = null
let activeRequestCount = 0

// 用户输入框内容
const question = ref('')

// 聊天消息列表
const messages = ref([])

// 知识库文件
const documents = ref([])

const fileInput = ref(null)

// 是否正在加载
const loading = ref(false)
const chatBox = ref(null)

// 当前选中的文件
const selectedFile = ref(null)

// 上传状态
const uploading = ref(false)

// 滚动函数
const scrollToBottom = async () => {
  await nextTick()

  if (chatBox.value) {
    chatBox.value.scrollTop = chatBox.value.scrollHeight
  }
}

const uploadFile = async () => {
  if (!selectedFile.value) {
    alert('请选择文件')
    return
  }
  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('user_id', USER_ID)
    formData.append('file', selectedFile.value)
    const response = await axios.post(`${API_BASE_URL}/upload`, formData)
    ElMessage.success(response.data.message)
    selectedFile.value = null
  } catch (error) {
    console.error(error)
    const errMsg = error.response?.data?.detail || '上传失败'
    ElMessage.error(errMsg)
  }
  uploading.value = false
  if (fileInput.value) {
    fileInput.value.value = ''
  }
  await loadDocuments()
  startPollingDocuments()
}

// 获取文件列表
const loadDocuments = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/documents`, { params: { user_id: USER_ID } })
    documents.value = response.data
  } catch (error) {
    console.error(error)
  }
}

// 删除文件
const deleteDocument = async (fileHash) => {
  ElMessageBox.confirm('确定要删除这个文件吗？', '提示', {
    type: 'warning',
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    closeOnClickModal: false,
  }).then(async () => {
    try {
      await axios.delete(`${API_BASE_URL}/delete_document`, {
        params: { user_id: USER_ID, file_hash: fileHash }
      })
      await loadDocuments()
      ElMessage.success('删除成功')
    } catch (error) {
      console.error(error)
      ElMessage.error('删除失败')
    }
  }).catch(() => {
    // 用户取消删除
  })
}

// 发送消息函数
const updateMessageAt = (messageIndex, patch) => {
  const currentMessage = messages.value[messageIndex]

  if (!currentMessage) {
    return
  }

  messages.value.splice(messageIndex, 1, {
    ...currentMessage,
    ...patch,
  })
}

const loadSourcesHistory = async (assistantIndex, requestId) => {
  const requestPayload = buildSourcesHistoryPayload(USER_ID, requestId)

  if (!requestPayload) {
    updateMessageAt(assistantIndex, {
      sourcesError: getSourcesHistoryErrorMessage(400),
    })
    return
  }

  updateMessageAt(assistantIndex, {
    sourcesLoading: true,
    sourcesError: '',
  })

  try {
    const response = await axios.post(`${API_BASE_URL}/sources_history`, requestPayload)
    const sourceState = getSourcesHistoryState(response.data, requestId)

    updateMessageAt(assistantIndex, {
      ...sourceState,
      sourcesLoading: false,
    })
  } catch (error) {
    console.error('Failed to load sources history', error)
    updateMessageAt(assistantIndex, {
      sourcesLoading: false,
      sourcesError: getSourcesHistoryErrorMessage(error.response?.status),
    })
  }
}

const sendMessage = async () => {
  // 防止空输入
  if (!question.value.trim()) {
    return
  }

  // 先把用户消息加入聊天列表
  messages.value.push({
    role: 'user',
    content: question.value,
  })

  const requestData = {
    user_id: USER_ID,
    question: question.value,
  }
  // 清空输入框
  question.value = ''
  activeRequestCount += 1
  loading.value = true

  const aiMessage = createAssistantMessage()
  messages.value.push(aiMessage)
  const assistantIndex = messages.value.length - 1

  try {
    // 调用 FastAPI 后端
    const response = await fetch(`${API_BASE_URL}/chat_stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    })
    const requestId = getRequestIdFromResponse(response)
    updateMessageAt(assistantIndex, { request_id: requestId })

    if (!response.ok) {
      throw new Error(`chat_stream failed with status ${response.status}`)
    }

    if (!response.body) {
      throw new Error('chat_stream response body is unavailable')
    }

    // 获取流读取器
    const reader = response.body.getReader()

    // 文本解码器
    const decoder = new TextDecoder('utf-8')

    // 持续读取
    while (true) {
      // 读取流数据
      const { done, value } = await reader.read()

      // done=true 表示结束
      if (done) {
        break
      }

      // 解码二进制数据
      const chunk = decoder.decode(value)
      const currentMessage = messages.value[assistantIndex]

      // 追加到 AI 消息
      if (currentMessage) {
        updateMessageAt(assistantIndex, {
          content: currentMessage.content + chunk,
        })
      }
      await scrollToBottom()
    }
    await loadSourcesHistory(assistantIndex, requestId)
    // const response = await axios.post(`${API_BASE_URL}/ask`, requestData)

    // 把 AI 回复加入聊天列表
    // messages.value.push({
    //   role: 'assistant',
    //   content: response.data.content,
    // })
  } catch (error) {
    console.error(error)

    messages.value.push({
      role: 'assistant',
      content: '请求失败，请检查后端服务',
    })
  } finally {
    activeRequestCount = Math.max(activeRequestCount - 1, 0)
    loading.value = activeRequestCount > 0
  }
}

const handleFileChange = (event) => {
  selectedFile.value = event.target.files[0]
}

const hasProcessingDocument = () => {
  return documents.value.some(doc => doc.status === 'processing')
}

const startPollingDocuments = () => {
  if (pollingTimer) {
    return
  }

  pollingTimer = setInterval(async () => {
    await loadDocuments()

    if (!hasProcessingDocument()) {
      clearInterval(pollingTimer)
      pollingTimer = null
    }
  }, 2000)
}
</script>

<template>
  <div class="main-layout">
    <!-- 左侧知识库 -->
    <div class="document-panel">
      <div class="document-header">
        <h2>知识库</h2>
      </div>

      <!-- 上传区域 -->
      <div class="upload-box">
        <input ref="fileInput" type="file" @change="handleFileChange" />

        <button @click="uploadFile" :disabled="uploading">
          {{ uploading ? '上传中...' : '上传文件' }}
        </button>
      </div>

      <!-- 文件列表 -->
      <div class="document-list">
        <div v-for="doc in documents" :key="doc.file_hash" class="document-item">
          <div class="document-left">
            <div class="document-name">{{ doc.filename }}</div>
            <div class="document-status">
              <span v-if="doc.status === 'processing'" class="status processing">
                处理中
              </span>
              <span v-else-if="doc.status === 'ready'" class="status ready">
                已完成
              </span>
              <span v-else-if="doc.status === 'failed'" class="status failed">
                失败
              </span>
            </div>
          </div>
          <button class="delete-btn" @click="deleteDocument(doc.file_hash)">
            删除
          </button>
        </div>
      </div>
    </div>

    <!-- 聊天区域 -->
    <div class="chat-wrapper">
      <!-- 聊天框 -->
      <div ref="chatBox" class="chat-box">
        <!-- 循环渲染消息 -->
        <div v-for="(msg, index) in messages" :key="index" class="message">
          <!-- 用户消息 -->
          <div v-if="msg.role === 'user'" class="user-row">
            <div class="user-message">{{ msg.content }}</div>
          </div>

          <!-- AI 消息 -->
          <div v-else class="ai-row">
            <div class="ai-message">{{ msg.content }}</div>
          </div>

          <!-- 来源 -->
          <div v-if="msg.sourcesError" class="sources-error">
            {{ msg.sourcesError }}
          </div>

          <div v-if="msg.sources && msg.sources.length" class="sources">
            <details v-for="(source, i) in msg.sources" :key="i" class="source-item">
              <summary class="source-filename" title="点击展开来源详情">
                {{ source.filename }}
              </summary>
              <div class="source-detail">
                <div>第 {{ source.page + 1 }} 页</div>
                <div class="source-content">{{ source.content }}</div>
              </div>
            </details>
          </div>

          <div
            v-else-if="msg.candidate_preview && msg.candidate_preview.length"
            class="candidate-preview"
          >
            <div class="candidate-preview-title">候选文档（未作为最终来源）</div>
            <div v-for="(candidate, i) in msg.candidate_preview" :key="i" class="candidate-item">
              <div>
                {{ candidate.filename || candidate.file_name || candidate.document_name || candidate.title || candidate.name || '候选文档' }}
              </div>
              <div v-if="candidate.content || candidate.preview" class="source-content">
                {{ candidate.content || candidate.preview }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 输入区域 -->
      <div class="input-box">
        <input v-model="question" placeholder="请输入问题" @keyup.enter="sendMessage" />

        <button @click="sendMessage" :disabled="loading">
          {{ loading ? '思考中...' : '发送' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.main-layout {
  display: flex;
  gap: 20px;
  height: calc(90vh - 56px);
}

/* 左侧知识库 */
.document-panel {
  width: 300px;
  background: white;
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.document-header {
  margin-bottom: 20px;
}

.document-header h2 {
  margin: 0;
}

/* 上传区域 */
.upload-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.upload-box input {
  width: 100%;
}

/* 文件列表 */
.document-list {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
}

.document-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #f7f8fa;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;
  transition: all 0.2s;
}

.document-item:hover {
  background: #f0f2f5;
  border-color: #d9d9d9;
}

.document-left {
  flex: 1;
  min-width: 0;
}

.document-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 6px;
}

.document-status {
  display: flex;
  align-items: center;
}

.status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
}

.status.processing {
  background: #fff7e6;
  color: #d48806;
}

.status.ready {
  background: #f6ffed;
  color: #389e0d;
}

.status.failed {
  background: #fff1f0;
  color: #cf1322;
}

.delete-btn {
  width: 64px;
  height: 34px;
  background: #ff4d4f;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s;
}

.delete-btn:hover {
  background: #ff7875;
}

.delete-btn:active {
  transform: scale(0.96);
}

/* 聊天区域 */
.chat-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* 聊天框 */
.chat-box {
  flex: 1;
  background: white;
  border-radius: 16px;
  padding: 20px;
  overflow-y: auto;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

/* 单条消息 */
.message {
  margin-bottom: 20px;
}

/* 用户消息 */
.user-row {
  display: flex;
  justify-content: flex-end;
}

.user-message {
  max-width: 70%;
  background: #1677ff;
  color: white;
  padding: 14px 18px;
  border-radius: 16px;
  line-height: 1.6;
  white-space: pre-wrap;
}

/* AI 消息 */
.ai-row {
  display: flex;
  justify-content: flex-start;
}

.ai-message {
  max-width: 70%;
  background: #f5f5f5;
  color: #333;
  padding: 14px 18px;
  border-radius: 16px;
  line-height: 1.6;
  white-space: pre-wrap;
}

/* 来源 */
.sources {
  margin-top: 10px;
}

.sources-error {
  margin-top: 10px;
  color: #b42318;
  font-size: 14px;
  line-height: 1.5;
}

.source-item {
  background: #f3f3f3;
  padding: 10px;
  border-radius: 8px;
  margin-top: 10px;
  font-size: 14px;
}

.source-filename {
  cursor: pointer;
  color: #1677ff;
  font-weight: 600;
  list-style: none;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.source-filename::-webkit-details-marker {
  display: none;
}

.source-filename::before {
  content: '▸';
  display: inline-block;
  margin-right: 6px;
  color: #667085;
  text-decoration: none;
}

.source-item[open] > .source-filename::before {
  content: '▾';
}

.source-filename:hover {
  color: #0958d9;
}

.source-detail {
  margin-top: 8px;
}

.source-content {
  margin-top: 5px;
  color: #666;
  line-height: 1.5;
}

.candidate-preview {
  margin-top: 10px;
}

.candidate-preview-title {
  color: #475467;
  font-size: 13px;
  font-weight: 700;
}

.candidate-item {
  margin-top: 8px;
  border: 1px dashed #d0d5dd;
  border-radius: 8px;
  background: #fcfcfd;
  padding: 10px;
  color: #344054;
  font-size: 14px;
}

/* 输入区域 */
.input-box {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

input {
  flex: 1;
  height: 40px;
  padding: 0 10px;
  font-size: 16px;
  border: 1px solid #ddd;
  border-radius: 10px;
}

/* 按钮 */
button {
  width: 100px;
  border: none;
  border-radius: 10px;
  background: #1677ff;
  color: white;
  cursor: pointer;
}
</style>
