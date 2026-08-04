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
  'submit',
  'retry',
  'closed',
])

const isResumeSuggestion = computed(() => props.suggestedDocumentType === 'resume')

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
    title="待确认"
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

      <p v-if="isResumeSuggestion" class="document-type-confirm-dialog__message">
        后端检测到当前文件为“简历”类型，请确认是否有误？
      </p>

      <el-form
        v-if="ready && isResumeSuggestion"
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
        <el-button-group v-if="ready && isResumeSuggestion">
          <el-button
            type="primary"
            :loading="submitting"
            :disabled="loading || submitting"
            @click="emit('submit', 'confirm_resume')"
          >
            简历信息确认
          </el-button>
          <el-button
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
