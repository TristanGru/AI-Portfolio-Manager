# AI Native Idea & Todo List

A living portfolio brain and backlog manager for AI-native projects. Tracks active projects, surfaces next tasks, manages recommendations, and maintains a signal system for portfolio-level events.

## What it does

- Maintains a `.project-memory/` workspace per project with tasks, recommendations, and session notes
- Tracks a portfolio-wide todo backlog (`TODOS.md`) with deferred items from design/eng reviews
- Uses a signal system (`.portfolio-brain/signals/`) to surface deploy blockers, thesis invalidations, and critical bugs across projects

## Structure

- `TODOS.md` — active backlog of deferred items
- `.project-memory/` — per-session task state, coding agent briefs, and recommendations
