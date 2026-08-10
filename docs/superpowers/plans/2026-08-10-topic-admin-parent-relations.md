# P05 Active Topic Parent Relations Implementation Record

## Final decisions

- The active topic table remains one row per `topic_id`.
- Approved relation rows are joined to active topics by `canonical_topic_id`.
- Only direct parents and direct children are shown; the frontend does not build a hierarchy or recursively infer ancestors/descendants.
- The active list adds a `父子关系` column and opens a Drawer for direct relation details.
- Only `review_status=approved` relations are used in the active-topic view.
- The active table labels `support_document_count` as `直接支持文档数`; inherited support is not inferred or counted by the frontend.
- A version mismatch between active topics and relations prevents joining and displays a warning.
- Approved relations do not imply that parent Rollup has completed.

## Implemented files

- `src/components/TopicTopicsPanel.vue`
- `tests/topicAdminMarkup.test.js`
- `src/services/topicTaxonomyAdmin.js` (active-topic and relation requests/normalizers)

## Verification

- The active-topic table, relation summary, Drawer, empty states, canonical-ID join, and no-tree boundary are covered by markup tests.
- Full test suite, targeted ESLint, production build, and `git diff --check` passed before commit preparation.
