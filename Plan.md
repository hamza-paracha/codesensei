# Plan.md — RAG-powered Project Explorer (feat/rag-explorer)

Objective
---------
Add a RAG-powered Project Explorer to Mac-a-thon-2026 that indexes the repository's README, key docs, and code symbols and exposes a grounded /api/search endpoint plus a small dashboard demo page. The feature should return source‑backed answers (file + line ranges, snippet), include unit/integration tests, and be delivered on branch `feat/rag-explorer` with a PR opened against main.

Scope (MVP)
-----------
- Index README.md, project_story.md, and top-level docs. Reuse existing AST-based chunking (backend/astParser.js) and vector cache (backend/vector_cache.json).
- Implement an indexing CLI: `node backend/scripts/index-docs.js` that loads files, creates embeddings via existing vertexai client, and updates vector_cache.json.
- Add a backend API endpoint: `POST /api/search` (backend/src/server.js) that accepts {query, topK=5} and returns structured results: [{file, startLine, endLine, text, score}].
- Add a small static demo page in dashboard/ (dashboard/src/routes/rag-demo.jsx) that calls /api/search and renders results with clickable file links.
- Add tests: unit tests for indexer and integration test for /api/search (use existing test tooling or add a simple mocha/jest test in backend/test/).
- CI: ensure package.json scripts include `test` and `start` so PR runs tests in CI.

Implementation Details
----------------------
- Indexing: reuse `backend/astParser.js` to extract AST symbol chunks. For non-parsable files (README, markdown), fall back to chunking by paragraphs (1500 chars). The indexer will call `backend/vertexai.js` embedding function and merge results into `vector_cache.json` using the same format as the repo (preserve caching behavior).

- Search endpoint: implement `POST /api/search` in `backend/src/server.js` (or create a new route file and wire to Express) that:
  1. Validates input.
  2. Calls backend/vectorStore.js search API (reuse existing function) with query and topK.
  3. Assembles structured results including file path and line range and short snippet.
  4. Returns JSON: {query, topK, results:[{file,path,startLine,endLine,text,score}]}.

- Demo page: a minimal React page using the existing dashboard infrastructure. Add a simple form (query input) and results list. Each result item shows file, line range, snippet, and a clickable link that opens the raw file on GitHub (use repo origin + path).

- Tests:
  - Unit: indexer should index README and produce at least one vector entry for README.
  - Integration: start backend in test mode, call /api/search with a known query (e.g., "How to run the backend") and assert results contain README or server.js citation.

Files to create/modify (high-level)
----------------------------------
- Add: `backend/scripts/index-docs.js` (indexer CLI)
- Modify: `backend/src/server.js` (add /api/search route) or add `backend/src/routes/search.js`
- Add: `dashboard/src/routes/rag-demo.jsx` + css
- Add: `backend/test/test-indexer.js` and `backend/test/test-search.js`
- Add: update `package.json` scripts: `index-docs`, `test`, `start` if missing
- Add: `Plan.md` (this file) and PR template changes

Branching & PR
---------------
- Branch: `feat/rag-explorer`
- Commit pattern: small commits per logical change (indexer, backend route, demo UI, tests)
- PR: title "feat(rag): RAG Project Explorer — README/Docs indexing + /api/search + demo". Include Plan.md as PR description and summary of changes.

Testing & QA
------------
- Run unit tests: `npm test` in backend. Expect indexer to produce a non-empty vector_cache.json temporarily (gitignored) during tests.
- Run integration: `npm run start` then POST /api/search; assert correct structure.
- Manual QA: open dashboard rag-demo and run a few example queries to confirm clickable links and snippets.

Estimate & Timeline
-------------------
- Analysis & Plan.md: 10–30 minutes (done)
- Indexer + backend search route: 1.5–3 hours
- Demo UI + basic styling: 1–2 hours
- Tests + CI script updates: 1 hour
- Buffer & PR polish: 30–60 minutes
- Total: ~5–8 hours (single developer + coding agent might parallelize tasks faster)

Dependencies & Credentials
--------------------------
- Vertex AI (embeddings + generation) — the repo already includes vertexai client; ensure `GCP_PROJECT_ID` and creds in backend/.env for local runs/test.
- Backboard optional — not required for MVP.
- No external paid vector DB required; we’ll use existing local vector_cache.json.

Safety & Rollback
-----------------
- All changes on a feature branch. No auto-merge. Tests must pass before PR is ready.
- vector_cache.json remains gitignored; indexer updates only local cache.

Next steps (I will perform now)
------------------------------
1. Create branch `feat/rag-explorer` locally and push when commits are ready. (gh auth present.)
2. Implement indexer + /api/search route, add demo page, add tests.
3. Run tests locally; fix issues as needed.
4. Push branch and open PR; post PR link here for review.

If you want me to proceed immediately, I will start the coding agent now and report back the first milestone (indexer implemented) within the next ~30–60 minutes. Otherwise reply: "hold".

---
Plan authored by Donzo Jr. — starting now (unless you say hold).