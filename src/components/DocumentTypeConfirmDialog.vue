<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  submitting: {
    type: Boolean,
    default: false,
  },
  ready: {
    type: Boolean,
    default: false,
  },
  error: {
    type: String,
    default: '',
  },
  fieldErrors: {
    type: Object,
    default: () => ({}),
  },
  suggestedDocumentType: {
    type: String,
    default: '',
  },
  manualResumeConversion: {
    type: Boolean,
    default: false,
  },
  selectedDocumentType: {
    type: String,
    default: '',
  },
  candidateDraft: {
    type: Object,
    default: () => ({
      candidate_name: '',
      phone: '',
      school: '',
    }),
  },
})

const emit = defineEmits([
  'update:modelValue',
  'update:candidateDraft',
  'update:selectedDocumentType',
  'submit',
  'retry',
  'closed',
])

const isResumeSuggestion = computed(() => props.suggestedDocumentType === 'resume')
const isResumeFlow = computed(() => (
  props.manualResumeConversion
    ? props.selectedDocumentType === 'resume'
    : isResumeSuggestion.value
))
const dialogTitle = computed(() => (
  props.manualResumeConversion ? '更改文件类型' : '待确认'
))

const handleModelValueUpdate = (value) => {
  if (props.submitting && !value) return
  emit('update:modelValue', value)
}

const handleCandidateDraftUpdate = (field, value) => {
  emit('update:candidateDraft', {
    ...props.candidateDraft,
    [field]: value,
  })
}

const cancel = () => {
  if (!props.submitting) emit('update:modelValue', false)
}

const handleClosed = () => {
  emit('closed')
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="dialogTitle"
    width="520px"
    :close-on-click-modal="false"
    :show-close="!submitting"
    @update:model-value="handleModelValueUpdate"
    @closed="handleClosed"
  >
    <div v-if="loading" class="document-type-confirm-dialog__loading">
      正在加载确认信息...
    </div>
    <div v-else>
      <div v-if="error" class="document-type-confirm-dialog__error">
        {{ error }}
        <el-button link type="primary" :disabled="submitting" @click="emit('retry')">重试</el-button>
      </div>

      <el-form
        v-if="ready && manualResumeConversion"
        label-position="top"
        class="document-type-confirm-dialog__type-form"
      >
        <el-form-item label="文件类型">
          <el-select
            :model-value="selectedDocumentType"
            :disabled="submitting"
            placeholder="请选择文件类型"
            @update:model-value="emit('update:selectedDocumentType', $event)"
          >
            <el-option label="简历" value="resume" />
          </el-select>
        </el-form-item>
      </el-form>

      <p v-if="isResumeFlow" class="document-type-confirm-dialog__message">
        <template v-if="manualResumeConversion">
          请填写简历信息，确认后将当前文件转换为简历。
        </template>
        <template v-else>
          后端检测到当前文件为“简历”类型，请确认是否有误？
        </template>
      </p>

      <el-form
        v-if="ready && isResumeFlow"
        :model="candidateDraft"
        label-position="top"
        class="document-type-confirm-dialog__form"
      >
        <el-form-item label="候选人" :error="fieldErrors.candidate_name">
          <el-input
            :model-value="candidateDraft.candidate_name"
            :disabled="submitting"
            @update:model-value="handleCandidateDraftUpdate('candidate_name', $event)"
          />
        </el-form-item>
        <el-form-item label="手机号" :error="fieldErrors.phone">
          <el-input
            :model-value="candidateDraft.phone"
            :disabled="submitting"
            @update:model-value="handleCandidateDraftUpdate('phone', $event)"
          />
        </el-form-item>
        <el-form-item label="学校" :error="fieldErrors.school">
          <el-input
            :model-value="candidateDraft.school"
            :disabled="submitting"
            @update:model-value="handleCandidateDraftUpdate('school', $event)"
          />
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <div class="document-type-confirm-dialog__actions">
        <el-button-group v-if="ready && isResumeFlow">
          <el-button
            type="primary"
            :loading="submitting"
            :disabled="loading || submitting"
            @click="emit('submit', 'confirm_resume')"
          >
            {{ manualResumeConversion ? '确认' : '简历信息确认' }}
          </el-button>
          <el-button
            v-if="!manualResumeConversion"
            type="danger"
            :loading="submitting"
            :disabled="loading || submitting"
            @click="emit('submit', 'reject_resume')"
          >
            不是简历
          </el-button>
        </el-button-group>
        <el-button :disabled="submitting" @click="cancel">取消</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.document-type-confirm-dialog__message {
  margin: 0 0 18px;
  color: #303133;
  line-height: 1.6;
}

.document-type-confirm-dialog__error {
  margin-bottom: 12px;
  color: #f56c6c;
}

.document-type-confirm-dialog__loading {
  color: #606266;
}

.document-type-confirm-dialog__type-form .el-select {
  width: 100%;
}

.document-type-confirm-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.document-type-confirm-dialog__actions .el-button-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.document-type-confirm-dialog__actions .el-button-group .el-button + .el-button {
  margin-left: 0;
}

.document-type-confirm-dialog__actions .el-button {
  white-space: nowrap;
}
</style>
