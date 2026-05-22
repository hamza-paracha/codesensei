# CodeSensei

### An Auditable Code Reasoning Engine for Whole-Repo Intelligence

[![Powered by Vertex AI](https://img.shields.io/badge/Vertex%20AI-Embeddings%20%2B%20Gemini%202.0-4285F4)](https://cloud.google.com/vertex-ai)
[![Memory by Backboard](https://img.shields.io/badge/Memory-Backboard.io-lightgrey)](https://backboard.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

CodeSensei indexes your entire repository at the symbol level, retrieves structurally relevant context, and generates answers grounded in your actual code. Every claim links back to a file and line range. When the evidence is weak, it says so instead of guessing.

It is not autocomplete. It is a reasoning system you can audit.

---

## How CodeSensei Differs

| Dimension | Copilot / ChatGPT | CodeSensei |
|:---|:---|:---|
| **Scope** | Open file or tab | Entire indexed repo |
| **Chunking** | Character-based token windows | AST-aware symbol boundaries (functions, classes) |
| **Transparency** | No source attribution | Clickable file + line citations for each claim |
| **Structural awareness** | None | Import/export dependency graph, symbol extraction |
| **Architecture tooling** | None | Interactive Architecture Builder with edit/view modes |
| **Privacy model** | Code sent to third-party cloud | All inference in your own GCP project |
| **Memory** | Resets per session | Persistent threads via Backboard.io |

This is not a feature comparison. It is a difference in approach: CodeSensei treats code as a graph of symbols and dependencies, not as a flat text buffer.

---

## The Grounding Contract

CodeSensei enforces a contract between the engine and the developer:

**1. Every claim cites its source.**
Answers include file paths and line ranges for the code they reference. You can click through and verify.

**2. Retrieved evidence is visible.**
The retrieval pipeline logs which chunks were considered, their relevance scores, and why they were selected. This data is available in the response metadata for inspection.

**3. Weak evidence triggers refusal.**
If the indexed repo does not contain enough relevant context (relevance scores below threshold), CodeSensei states what it could not find and asks for a pointer rather than fabricating an answer. The system prompt explicitly instructs the model: "If the context doesn't contain enough information to fully answer, say so."

**4. Direct mode skips retrieval entirely.**
When you use Explain Code in VS Code, the highlighted code is sent directly to the model with no retrieval step. This eliminates the risk of injecting unrelated context and gives you a clean, scoped explanation of exactly what you selected.

---

## The Code Reasoning Pipeline

Most retrieval systems treat source code like a document: split it at character boundaries, embed the fragments, and hope the right pieces surface. This fails for code because a function split at line 47 is not a meaningful unit.

CodeSensei uses a structure-aware pipeline:

```
Query
  |
  v
Intent Analysis
  |
  v
Symbol Extraction (Babel AST)
  Parse JS/TS/JSX/TSX into AST
  Extract functions, classes, variables, imports/exports
  Chunk at symbol boundaries, not character limits
  |
  v
Dependency Context
  Build import/export graph across files
  Map symbol-to-file relationships
  Score file importance (connections + exports + symbol count)
  |
  v
Semantic Retrieval (Vertex AI text-embedding-004)
  Embed query into 768-d vector
  Cosine similarity against indexed chunks
  Hybrid fallback: if <3 results or top score <0.6, add keyword matches
  Prioritize current-file chunks when code is highlighted (70/30 split)
  |
  v
Context Assembly + Generation (Gemini 2.0 Flash)
  Top 5 chunks with scores + dependency context + user code
  System prompt calibrated to context quality (high/medium/low)
  Structured answer with file:line citations
```

**Why AST boundaries matter.** Babel parses each file and identifies function declarations, class bodies, and variable assignments as discrete units. Each chunk is a complete logical block with metadata (symbol name, type, parameters, line range). When the model receives these chunks, it is working with whole symbols, not fragments. The fallback to character-based chunking (1500 chars, 200 overlap) only activates for files that fail to parse.

---

## Three Core Workflows

### 1. Explain Code (Direct Analysis)

Select code in VS Code, press `Cmd+Shift+E`. The highlighted code goes straight to Gemini with no retrieval layer. You get a scoped explanation of exactly that code: what it does, how it works, and where it could break.

**Why this matters:** No RAG noise. No risk of the model weaving in unrelated files. The answer is about the code in front of you, and only that code.

### 2. Ask with Citations (Grounded Q&A)

Ask a question about your project through the dashboard or VS Code (`Cmd+Shift+A`). The pipeline indexes the repo, retrieves the most relevant chunks, and generates an answer with file and line references.

**What makes it different:**
- Chunks are AST-aligned, so the model sees complete functions, not fragments.
- Relevance scores are tracked per chunk. Low-confidence retrievals trigger a warning in the system prompt, telling the model to hedge rather than hallucinate.
- If you ask from VS Code with a file open, chunks from that file are weighted higher (7 current-file chunks vs 3 from the rest of the repo).

### 3. Architecture Builder and Code DNA

The dashboard provides two structural tools built from the actual dependency graph, not from LLM speculation:

**Code DNA** is an interactive force-directed graph of your repo's import/export relationships. Nodes represent files or symbols (toggle between levels). Node color and size reflect structural role: heavily imported files appear as larger hubs. You can zoom, pan, and click any node to inspect it.

**Architecture Builder** replaces the static Mermaid view with a fully interactive, React Flow–powered canvas:

- **Edit vs View mode.** View mode is read-only. Edit mode allows dragging nodes, creating connections, and adding instructions.
- **Component Library.** Drag templates (UI Screen, API Route, Service, Auth, Worker, Database, Integration) or click Add to create draft nodes.
- **Draft vs Actual nodes.** Actual nodes come from the AST graph; Draft nodes are your ideas.
- **Node Instructions.** Click a node (in edit mode) to add plain-English goals for the AI.
- **Commit to Code.** Sends the full visual graph to the backend and returns a refactor plan for review.
- **Onboarding tutorial.** First-run walkthrough explains the workflow in plain language.

Both tools are generated from parsed import/export statements, not from the LLM's general knowledge. The graph is your code's actual structure.

---

## Trust and Evaluation

### How We Measure Reliability

CodeSensei tracks retrieval quality at each step of the pipeline. Every response includes metadata: which chunks were considered, their cosine similarity scores, and whether keyword fallback was triggered.

The following metrics define our reliability targets:

| Metric | Definition | Example Target |
|:---|:---|:---|
| Citation coverage | % of factual claims with a file:line reference | > 90% |
| Unsupported-claim rate | % of claims that reference code not in the repo | < 5% |
| Correct file hit rate | % of retrieved chunks from the actually relevant file | > 75% |
| Retrieval confidence | Average cosine similarity of top-5 chunks | > 0.65 |
| Refusal rate on out-of-scope | % of unanswerable queries that trigger a refusal | > 80% |

These are example targets. The local harness below now measures the retrieval layer against a small ground-truth suite.

### Local Eval Harness

Run the retrieval eval from the workspace root:

```bash
npm run eval
```

The harness lives in `backend/src/evaluate.js` and reads cases from
`backend/evals/ground-truth.json`. It indexes the workspace, retrieves the top
chunks for each question, checks expected file coverage, and includes an
unanswerable probe so changes to retrieval do not silently increase hallucination
risk. Override the target repo with:

```bash
CODESENSEI_EVAL_WORKSPACE=/path/to/repo npm run eval
```

---

## Security and Privacy

### What stays where

**Your GCP project, your data.** All Vertex AI calls (embeddings and generation) route to the GCP project you configure. Code is sent to Google's Vertex AI API within your project boundary. It is not sent to OpenAI, Anthropic, or any third-party model provider.

**Local embedding cache.** Computed embeddings are cached in `backend/vector_cache.json` on the machine running the backend. This file is gitignored by default. It contains vector representations of your code chunks, not raw source code, though chunk text is stored alongside vectors for retrieval.

**Chat memory.** Persistent conversation threads are stored in Backboard.io. This means conversation content (your questions and the model's answers) is sent to Backboard's API. If this is a concern, Backboard can be disabled by omitting the API key; chat will still work but will not persist across sessions.

### Recommended configuration

- Restrict the GCP project to your organization's VPC if you need network-level isolation.
- Review `backend/.env` to ensure no secrets are committed. The `.env.example` template contains only placeholder values.
- For repos with sensitive content, consider adding file-level exclusion patterns in the extension config (`EXCLUDE_PATTERNS`) to prevent indexing of secrets, credentials, or PII.

We do not currently implement automatic secret detection or PII scrubbing. These are recommended as manual configuration steps.

---

## What We Do Not Do

- **We do not claim certainty without evidence.** If the retrieval pipeline cannot find relevant code, the system prompt instructs the model to say so. This is a prompt-level guardrail, not a hard technical guarantee.
- **We do not train on your repo.** Vertex AI models are Google's pretrained models. Your code is used for inference only. Embeddings are cached locally and not sent anywhere beyond the Vertex AI API.
- **We do not silently invent architecture facts.** The dependency graph and architecture diagrams are built from parsed import/export statements. If a relationship is not in your code, it does not appear in the graph.
- **We do not run in CI, comment on PRs, or integrate with git history.** CodeSensei is an interactive analysis tool, not a CI pipeline component.

---

## Quick Start

### Prerequisites

- Node.js 18+
- Google Cloud account with Vertex AI API enabled
- VS Code 1.85+
- Backboard.io account (optional, for persistent chat memory)

### 1. Configure Google Cloud

```bash
# Install gcloud CLI: https://cloud.google.com/sdk/docs/install
gcloud init
gcloud auth application-default login
gcloud services enable aiplatform.googleapis.com
```

### 2. Configure Backboard.io (Optional)

1. Create an account at https://app.backboard.io
2. Create an assistant
3. Copy your API key and Assistant ID

### 3. Start the Backend

```bash
cd backend
cp .env.example .env
# Edit .env:
#   GCP_PROJECT_ID=your-project-id
#   BACKBOARD_API_KEY=your-backboard-key       (optional)
#   BACKBOARD_ASSISTANT_ID=your-assistant-id   (optional)

npm install
npm start
# Runs at http://localhost:3000
```

### 4. Install the VS Code Extension

```bash
cd vscode-extension
npx vsce package
code --install-extension codesensei-1.0.0.vsix
```

Or for development: open the `vscode-extension` folder in VS Code and press F5.

### 5. Launch the Dashboard

```bash
cd dashboard
npm install
npm run dev
# Opens at http://localhost:5173
```

### 6. Verify It Works

1. Open a project in VS Code. Wait for "CodeSensei (X files)" in the status bar.
2. Select a function, press `Cmd+Shift+E` (Mac) or `Ctrl+Shift+E` (Windows). You should get an explanation of that code with no retrieval step.
3. Press `Cmd+Shift+A` / `Ctrl+Shift+A` and ask a question about the project. The answer should include file references.
4. Open the dashboard at `http://localhost:5173` and check the Code DNA and Architecture tabs.

---

## 60-Second Demo Script

For judges or anyone evaluating CodeSensei quickly:

1. **Start the backend:** `cd backend && npm start`
2. **Open VS Code** with the extension installed. Open a project with 10+ files.
3. **Wait for indexing** (status bar shows file count).
4. **Explain Code:** Select a function body, press `Cmd+Shift+E`. Note: no retrieval, just a clean scoped explanation.
5. **Ask a grounded question:** Press `Cmd+Shift+A`, ask "What does the authentication flow look like?" (or any architectural question relevant to the repo). Check that the response cites specific files and lines.
6. **Open the dashboard** at `localhost:5173`. Click "Code DNA" to see the dependency graph. Click "Architecture" to see the generated Mermaid diagram.
7. **Verify the graph is real:** Click a node in Code DNA. Confirm the file and its imports match your actual code.

---

## Keyboard Shortcuts

| Command | Mac | Windows/Linux |
|:---|:---|:---|
| Ask (RAG Q&A) | `Cmd+Shift+A` | `Ctrl+Shift+A` |
| Explain Code (direct) | `Cmd+Shift+E` | `Ctrl+Shift+E` |
| Find Bugs | `Cmd+Shift+B` | `Ctrl+Shift+B` |
| Quick Menu | `Cmd+Shift+C` | `Ctrl+Shift+C` |

Additional commands available via the command palette: Suggest Refactor, Generate Tests, Re-index Workspace, Toggle Mentor Mode.

---

## Project Structure

```
Mac-a-thon-2026/
├── backend/
│   ├── src/
│   │   ├── server.js        # Express API, file watcher, auto-indexing
│   │   ├── ai.js            # RAG query logic, retrieval step tracking
│   │   ├── vertexai.js      # Vertex AI client (embeddings + Gemini)
│   │   ├── vectorStore.js   # Vector store, AST-based chunking, hybrid search
│   │   ├── astParser.js     # Babel AST parser, symbol extraction
│   │   ├── backboard.js     # Backboard.io thread management
│   │   ├── prompts.js       # System prompts (analysis, refactor, architecture)
│   │   ├── config.js        # Configuration and defaults
│   │   └── logger.js        # Winston logger
│   ├── .env.example
│   ├── package.json
│   └── vector_cache.json    # Local embedding cache (gitignored)
│
├── vscode-extension/
│   ├── extension.js         # Commands, indexing, skipRAG routing
│   └── package.json
│
├── dashboard/
│   └── src/
│       ├── App.jsx          # React app (chat, Code DNA, architecture)
│       └── App.css
│
├── setup.sh
├── .gitignore
└── README.md
```

## API Reference

| Endpoint | Method | Purpose |
|:---|:---|:---|
| `/health` | GET | Health check, Vertex AI connection status, index stats |
| `/api/status` | GET | Index readiness, workspace path |
| `/api/index` | POST | Index files (auto-detects changes, incremental) |
| `/api/ask` | POST | Query with RAG or direct mode (`skipRAG` flag) |
| `/api/analyze` | POST | Bug and security analysis with line references |
| `/api/refactor` | POST | Refactoring suggestions |
| `/api/tests` | POST | Unit test generation |
| `/api/architecture` | POST | Generate Mermaid architecture diagram |
| `/api/knowledge-graph` | GET | Dependency graph data for Code DNA |
| `/api/chat/thread` | POST | Create Backboard.io conversation thread |

## Configuration

### Backend (.env)

```env
# Required
GCP_PROJECT_ID=your-project-id

# Optional (enables persistent chat)
BACKBOARD_API_KEY=your-backboard-api-key
BACKBOARD_ASSISTANT_ID=your-assistant-id

# Optional
GCP_LOCATION=northamerica-northeast2
GCP_EMBEDDING_LOCATION=northamerica-northeast2
PORT=3000
LOG_LEVEL=info
```

### VS Code Extension Settings

```json
{
  "codesensei.backendUrl": "http://localhost:3000",
  "codesensei.dashboardUrl": "http://localhost:5173",
  "codesensei.autoIndex": true,
  "codesensei.maxFilesToIndex": 500,
  "codesensei.autoStartBackend": true,
  "codesensei.autoStartDashboard": true,
  "codesensei.backendStartCommand": "",
  "codesensei.dashboardStartCommand": ""
}
```

---

## Stack

| Layer | Technology | Role |
|:---|:---|:---|
| LLM | Gemini 2.0 Flash (via Vertex AI) | Generation, analysis, architecture prompts |
| Embeddings | text-embedding-004 (768-d vectors) | Semantic search over code chunks |
| AST parsing | Babel (JSX, TypeScript, decorators) | Symbol extraction, structure-aware chunking |
| Memory | Backboard.io | Persistent conversation threads |
| Backend | Node.js, Express, chokidar | API server, real-time file watching |
| Extension | VS Code Extension API | Editor integration, auto-indexing |
| Dashboard | React + Vite | Chat UI, Code DNA graph, architecture viewer |
| Visualization | react-force-graph-2d, Mermaid.js | Dependency graph, architecture diagrams |

---

## Troubleshooting

**"Backend not running"**: Run `cd backend && npm start`.

**"Vertex AI not configured" or "Model Not Found"**: Verify `GCP_PROJECT_ID` in `.env`, run `gcloud auth application-default login`, and ensure the Vertex AI API is enabled. Try `GCP_LOCATION=northamerica-northeast2` if the model is not found in your default region. If embeddings return 404, set `GCP_EMBEDDING_LOCATION` to a supported region.

**"No files indexed"**: Open a workspace folder (not a single file). Check the status bar or dashboard for indexing progress. Use "Re-Index Project" in the dashboard or `CodeSensei: Re-index Workspace` from the command palette.

**Backboard 422 errors**: Verify `BACKBOARD_API_KEY` and `BACKBOARD_ASSISTANT_ID` in `.env`. Restart the backend after changes.

**Explain Code returning unrelated context**: Explain Code uses `skipRAG` and should not retrieve external chunks. If this happens, confirm you are using `Cmd+Shift+E`, not `Cmd+Shift+A`.

---

## Roadmap

These are the areas we plan to invest in next, all aligned with deepening the grounding and structural reasoning capabilities:

1. **Expand evaluation coverage.** Grow the ground-truth suite from the starter cases to 20-30 questions per test repo.
2. **Evidence panel in the dashboard.** Surface retrieved chunks, their relevance scores, and the reasoning trace directly in the chat UI so users can inspect why an answer was given.
3. **Cross-language AST support.** Extend Babel-based parsing to Python, Go, and Rust via language-specific parsers, enabling structure-aware chunking for polyglot repos.
4. **Strict grounding mode.** A toggle that rejects any answer where the top retrieval score falls below a configurable threshold, forcing refusal over speculation.
5. **Vector database option.** Replace the local JSON cache with an optional vector database (Pinecone, Weaviate, or pgvector) for repos that exceed in-memory scale.

---

## License

MIT

---

Built for Mac-a-thon 2026
