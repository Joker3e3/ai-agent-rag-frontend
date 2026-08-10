# P05 Topic Admin Governance Implementation Record

> Final implementation record for the MVP frontend scope. Backend, database, and API contract files were not modified.

## Goal and final scope

The frontend adds an independent `/topic-admin` page with four functional areas:

1. Candidate topic review;
2. Parent-child relation discovery and review;
3. Parent Rollup execution, history, and batch rollback;
4. Topic audit history and the currently active topic list.

Taxonomy version activation/rollback, document topic proposal generation, permission probing, database access, document正文/chunks, and document assignment detail remain out of scope.

## Implemented architecture

- `TopicAdminView.vue` owns the independent route, lazy Tab activation, shared `taxonomy_version`, and editable Rollup `user_id`.
- `topicTaxonomyAdmin.js` owns all administrator requests, the fixed `X-Topic-Admin-ID: TEST_ADMIN_ID` header, request payload builders, response normalizers, and Chinese error mapping.
- `TopicCandidatesPanel.vue` handles candidate review and explicitly shows that approved topics still require relation discovery.
- `TopicRelationsPanel.vue` queries the backend active version, discovers proposed relations, and separately reviews proposed relations.
- `TopicRollupPanel.vue` executes parent Rollup, stores the backend `run_id`, queries history, and only allows Popconfirm rollback for succeeded rows.
- `TopicTopicsPanel.vue` separates audit history from active topics. Active rows remain keyed by `topic_id`; approved relations are joined by `canonical_topic_id` and shown as direct parent/child summaries in a Drawer, without hierarchy inference.
- Candidate rows expose only approve, reject, and merge. Active rows own the deprecate action and refresh both the active list and audit history after success.
- Backend integration confirms the existing topic review endpoint accepts `deprecate` for `active + approved` topics.

## Integrated administrator interfaces

All requests send `X-Topic-Admin-ID: TEST_ADMIN_ID`.

```text
GET  /admin/topic-taxonomy/proposals
POST /admin/topic-taxonomy/topics/{topic_id}/review
GET  /admin/topic-taxonomy/relations
POST /admin/topic-taxonomy/relations/discover
POST /admin/topic-taxonomy/relations/{relation_id}/review
POST /admin/topic-taxonomy/rollups/parent
GET  /admin/topic-taxonomy/rollups
POST /admin/topic-taxonomy/rollups/{run_id}/rollback
GET  /admin/topic-taxonomy/topics/history
GET  /admin/topic-taxonomy/topics/active
```

The relation response supplies `taxonomy_version` for discovery and Rollup. Discovery and Rollup are disabled when no active version is available. Rollup history adapts to the backend `{ items, total, limit, offset }` envelope and uses each row's `run_id` for rollback.

## Verification record

- `npm test`: 76/76 passed;
- targeted ESLint: passed;
- `npm run build`: passed;
- `git diff --check`: passed;
- Vite reports the existing large JavaScript chunk warning; it does not fail the build.

## Deferred consistency follow-up

Candidate topic status display should be aligned with the backend topic schema (`system`, `proposed`, `active`, `deprecated`) and review schema (`pending`, `approved`, `rejected`, `merged`). This is a small frontend-only consistency improvement and is not included in this commit unless separately approved.
