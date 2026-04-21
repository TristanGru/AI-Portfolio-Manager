# AI Native Idea & Todo List

A living portfolio brain and backlog manager for AI-native projects. Scans your project folders, tracks active sessions, surfaces next tasks, and uses Claude to generate recommendations — all from a local Electron desktop app or web UI.

## What it does

- **Portfolio scanner** — watches a folder of projects, reads git history, and builds health signals (velocity, last commit age, active/idle/archived status)
- **Per-project memory** — each project gets a `.project-memory/` workspace with tasks, recommendations, coding agent briefs, and session notes written during active development
- **AI recommendations** — uses Claude (Anthropic SDK) to evaluate project health and generate a prioritized recommendation for what to work on next
- **Signal system** — `.portfolio-brain/signals/pending/` collects deploy blockers, thesis invalidations, and critical bugs surfaced by Claude Code agents working inside each project
- **Backlog tracking** — `TODOS.md` holds deferred items from design and eng reviews

## Project structure

```
src/
  client/          # React + Vite UI
  server/          # Express API + services
    services/
      repo-scanner.ts           # git heuristics (velocity, last commit, health)
      portfolio-service.ts      # project discovery and aggregation
      recommendation-service.ts # Claude-powered next-action recommendations
      project-memory-service.ts # reads/writes .project-memory/ per project
      pending-signal-service.ts # processes portfolio-brain signals
      watcher-service.ts        # file-system watcher for live updates
      llm-rationale-service.ts  # LLM calls via Anthropic SDK
  desktop/         # Electron main + preload
  shared/          # shared types and contracts
scripts/
  install-desktop.mjs  # builds and installs the Electron app
  launch-desktop.mjs   # launches desktop app after build
```

## Install

```bash
npm install
```

Requires Node 18+. Requires an `ANTHROPIC_API_KEY` environment variable for AI recommendations.

```bash
cp .env.example .env   # then fill in ANTHROPIC_API_KEY
```

## Usage

### Web (dev)

```bash
npm run dev
```

Opens the React UI at `http://localhost:5173` with the Express API running alongside it.

### Desktop (Electron)

Install the desktop app once:

```bash
npm run install:desktop
```

Then launch it any time:

```bash
npm run desktop
```

Or open the installed app directly from your system.

### Production web server

```bash
npm run build
node dist/server/index.js
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start client + server in watch mode |
| `npm run build` | Build client and server for production |
| `npm run desktop` | Build and launch the Electron desktop app |
| `npm run install:desktop` | Install the Electron app to the system |
| `npm test` | Run the test suite (Vitest) |
| `npm run lint` | TypeScript type-check all entry points |

## How the per-project memory works

Each project folder tracked by this app gets a `.project-memory/` directory injected into it. Claude Code agents working inside those projects read and write to this directory:

```
.project-memory/
  tasks/
    next-task.md          # the specific next thing to build
    coding-agent-brief.md # operating mode, thesis, constraints
  recommendations/
    current.md            # current recommendation and rationale
  workspace/
    session-notes.md      # decisions made this session
    bugs.md               # bugs found
    ideas.md              # ideas that came up
    progress.md           # completed tasks
```

## Signal system

Agents write to `.portfolio-brain/signals/pending/<name>.jsonl` when they hit a portfolio-level event (deploy blocker, thesis invalidation, critical bug). The app picks these up and surfaces them in the UI.

Signal format:
```json
{"type": "note", "source": "claude-code", "summary": "...", "details": "..."}
```

## Open TODOs

See [TODOS.md](TODOS.md) for deferred backlog items — currently includes monorepo/multi-project-per-folder awareness and portfolio folder persistence.

## Tech stack

- **Frontend:** React 18, Vite, TypeScript
- **Backend:** Express, Node 18+, TypeScript
- **Desktop:** Electron 41
- **AI:** Anthropic SDK (`@anthropic-ai/sdk`) — Claude for recommendations and rationale
- **Testing:** Vitest, Testing Library, Supertest
