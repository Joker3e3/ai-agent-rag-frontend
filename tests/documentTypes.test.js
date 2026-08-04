import assert from 'node:assert/strict'
import test from 'node:test'

const helpers = await import('../src/services/documentTypes.js').catch(() => null)

const getHelper = (name) => {
  assert.ok(helpers, 'documentTypes service is not available yet')
  assert.equal(typeof helpers[name], 'function', `${name} is not exported yet`)
  return helpers[name]
}

test('does not show resume confirmation for a normal document', () => {
  const canShowResumeConfirmation = getHelper('canShowResumeConfirmation')

  assert.equal(canShowResumeConfirmation({
    status: 'ready',
    suggested_document_type: 'document',
    requires_confirmation: true,
  }), false)
})

test('shows resume confirmation only for ready pending suggestions', () => {
  const canShowResumeConfirmation = getHelper('canShowResumeConfirmation')
  const canUseResumeTypeReview = getHelper('canUseResumeTypeReview')

  assert.equal(canShowResumeConfirmation({
    status: 'processing',
    suggested_document_type: 'resume',
    requires_confirmation: true,
  }), false)
  assert.equal(canShowResumeConfirmation({
    status: 'ready',
    suggested_document_type: 'resume',
    requires_confirmation: true,
    classification_status: 'pending_confirmation',
  }), true)
  assert.equal(canUseResumeTypeReview({
    suggested_document_type: 'resume',
    classification_status: 'pending_confirmation',
    requires_confirmation: true,
  }), true)
})

test('shows a manual conversion action for ready generic documents', () => {
  const canShowResumeConversion = getHelper('canShowResumeConversion')
  const canUseResumeTypeReview = getHelper('canUseResumeTypeReview')

  assert.equal(canShowResumeConversion({
    status: 'ready',
    document_type: 'document',
    requires_confirmation: false,
  }), true)
  assert.equal(canUseResumeTypeReview({
    document_type: 'document',
    requires_confirmation: false,
  }, 'conversion'), true)
  assert.equal(canUseResumeTypeReview({
    document_type: 'document',
    requires_confirmation: false,
  }), false)
})

test('prioritizes processing, failed, and confirmation labels over document type', () => {
  const getDocumentStatusLabel = getHelper('getDocumentStatusLabel')

  assert.equal(getDocumentStatusLabel({ status: 'processing', document_type: 'resume' }), '处理中')
  assert.equal(getDocumentStatusLabel({ status: 'failed', document_type: 'resume' }), '处理失败')
  assert.equal(getDocumentStatusLabel({
    status: 'ready',
    document_type: 'resume',
    requires_confirmation: true,
  }), '待确认')
  assert.equal(getDocumentStatusLabel({
    status: 'ready',
    document_type: 'document',
    requires_confirmation: false,
  }), '文件')
  assert.equal(getDocumentStatusLabel({
    status: 'ready',
    document_type: 'resume',
    requires_confirmation: false,
  }), '简历')
})

test('normalizes the candidate draft used by the confirmation form', () => {
  const normalizeCandidateDraft = getHelper('normalizeCandidateDraft')

  assert.deepStrictEqual(normalizeCandidateDraft({
    candidate_name: '<CANDIDATE_NAME>',
    phone: '<PHONE>',
    school: '<UNIVERSITY>',
  }), {
    candidate_name: '<CANDIDATE_NAME>',
    phone: '<PHONE>',
    school: '<UNIVERSITY>',
  })
})

test('uses the extracted decision when the user leaves the draft unchanged', () => {
  const resolveResumeConfirmationDecision = getHelper('resolveResumeConfirmationDecision')

  assert.deepStrictEqual(resolveResumeConfirmationDecision({
    candidate_name: '<CANDIDATE_NAME>',
    phone: '<PHONE>',
    school: null,
  }, {
    candidate_name: ' <CANDIDATE_NAME> ',
    phone: '<PHONE>',
    school: '',
  }), {
    decision: 'confirm_resume_as_extracted',
  })
})

test('uses corrections when the user changes a draft field', () => {
  const resolveResumeConfirmationDecision = getHelper('resolveResumeConfirmationDecision')

  assert.deepStrictEqual(resolveResumeConfirmationDecision({
    candidate_name: '<CANDIDATE_NAME>',
    phone: '<PHONE>',
    school: null,
  }, {
    candidate_name: '<CANDIDATE_NAME>',
    phone: '<PHONE>',
    school: '<UNIVERSITY>',
  }), {
    decision: 'confirm_resume_with_corrections',
    candidate: {
      candidate_name: '<CANDIDATE_NAME>',
      phone: '<PHONE>',
      school: '<UNIVERSITY>',
    },
  })
})

test('manual generic-document conversion always submits required corrections', () => {
  const resolveManualResumeConversionDecision = getHelper('resolveManualResumeConversionDecision')

  assert.deepStrictEqual(resolveManualResumeConversionDecision({
    candidate_name: 'Test Candidate',
    phone: '13900000010',
    school: 'Example University',
  }), {
    decision: 'confirm_resume_with_corrections',
    candidate: {
      candidate_name: 'Test Candidate',
      phone: '13900000010',
      school: 'Example University',
    },
  })
})

test('builds the extracted resume decision payload', () => {
  const createTypeDecisionPayload = getHelper('createTypeDecisionPayload')

  assert.deepStrictEqual(createTypeDecisionPayload('confirm_resume_as_extracted'), {
    decision: 'confirm_resume_as_extracted',
  })
})

test('builds the corrected resume decision payload', () => {
  const createTypeDecisionPayload = getHelper('createTypeDecisionPayload')

  assert.deepStrictEqual(createTypeDecisionPayload('confirm_resume_with_corrections', {
    candidate_name: '<CANDIDATE_NAME>',
    phone: '<PHONE>',
    school: '<UNIVERSITY>',
  }), {
    decision: 'confirm_resume_with_corrections',
    candidate: {
      candidate_name: '<CANDIDATE_NAME>',
      phone: '<PHONE>',
      school: '<UNIVERSITY>',
    },
  })
})

test('builds the rejected resume decision payload', () => {
  const createTypeDecisionPayload = getHelper('createTypeDecisionPayload')

  assert.deepStrictEqual(createTypeDecisionPayload('reject_resume'), {
    decision: 'reject_resume',
  })
})

test('maps document confirmation errors and field validation errors', () => {
  const getDocumentWorkflowErrorMessage = getHelper('getDocumentWorkflowErrorMessage')
  const getValidationFieldErrors = getHelper('getValidationFieldErrors')

  assert.match(getDocumentWorkflowErrorMessage(404), /不存在或不属于当前用户/)
  assert.match(getDocumentWorkflowErrorMessage(409), /刷新列表/)
  assert.match(getDocumentWorkflowErrorMessage(422), /候选人信息校验失败/)
  assert.match(getDocumentWorkflowErrorMessage(), /网络错误/)
  assert.deepStrictEqual(getValidationFieldErrors([
    { loc: ['body', 'candidate', 'phone'], msg: '手机号校验失败' },
    { loc: ['body', 'candidate', 'school'], msg: '学校校验失败' },
  ]), {
    phone: '手机号校验失败',
    school: '学校校验失败',
  })
})

test('falls back to Chinese for English document operation messages', () => {
  const getLocalizedDocumentMessage = getHelper('getLocalizedDocumentMessage')

  assert.equal(
    getLocalizedDocumentMessage('upload accepted', '文件上传成功，正在处理中'),
    '文件上传成功，正在处理中',
  )
  assert.equal(
    getLocalizedDocumentMessage('上传成功', '文件上传成功，正在处理中'),
    '上传成功',
  )
})

test('refreshes documents after a successful type decision', async () => {
  const executeTypeDecision = getHelper('executeTypeDecision')
  const requests = []
  let refreshCount = 0
  let notifyCount = 0

  await executeTypeDecision({
    post: async (...args) => {
      requests.push(args)
      return { data: { status: 'confirmed' } }
    },
    apiBaseUrl: 'http://api.test',
    userId: 'test-user',
    documentId: 'doc-1',
    decision: 'confirm_resume_as_extracted',
    refreshDocuments: async () => { refreshCount += 1 },
    notifyStateChanged: () => { notifyCount += 1 },
  })

  assert.deepStrictEqual(requests[0], [
    'http://api.test/documents/doc-1/type-decision',
    { decision: 'confirm_resume_as_extracted' },
    { params: { user_id: 'test-user' } },
  ])
  assert.equal(refreshCount, 1)
  assert.equal(notifyCount, 1)
})

test('deletes a document and refreshes state without deleting a candidate', async () => {
  const executeDocumentDelete = getHelper('executeDocumentDelete')
  const requests = []
  let refreshCount = 0
  let notifyCount = 0

  await executeDocumentDelete({
    remove: async (...args) => {
      requests.push(args)
      return { data: { status: 'deleted' } }
    },
    apiBaseUrl: 'http://api.test',
    userId: 'test-user',
    documentId: 'doc-1',
    refreshDocuments: async () => { refreshCount += 1 },
    notifyStateChanged: () => { notifyCount += 1 },
  })

  assert.deepStrictEqual(requests, [[
    'http://api.test/documents/doc-1',
    { params: { user_id: 'test-user' } },
  ]])
  assert.equal(refreshCount, 1)
  assert.equal(notifyCount, 1)
})
