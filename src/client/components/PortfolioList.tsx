import { useState } from "react";
import type { ProjectStatus, ProjectSummary } from "../../shared/domain";

type Props = {
  projects: ProjectSummary[];
  selectedProjectId?: string;
  onSelect: (projectId: string) => void;
};

const STATUS_LABELS: Record<ProjectStatus, string> = {
  "active": "Active",
  "yet-to-start": "Yet to start",
  "cool-down": "Cool-down",
  "maintenance-only": "Maintenance",
  "archived": "Archived"
};

export function PortfolioList({ projects, selectedProjectId, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");

  const filtered = projects.filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const statuses = Array.from(new Set(projects.map((p) => p.status))) as ProjectStatus[];

  return (
    <section className="panel portfolio-panel">
      <div className="panel-header">
        <p className="eyebrow">Portfolio Layer</p>
        <h2>Where your attention should go next</h2>
      </div>

      {projects.length > 0 && (
        <div className="portfolio-filters">
          <input
            type="search"
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search projects"
            className="portfolio-search"
          />
          <div className="filter-pills">
            <button
              type="button"
              className={`filter-pill ${statusFilter === "all" ? "filter-pill--active" : ""}`}
              onClick={() => setStatusFilter("all")}
            >
              All
            </button>
            {statuses.map((s) => (
              <button
                key={s}
                type="button"
                className={`filter-pill ${statusFilter === s ? "filter-pill--active" : ""}`}
                onClick={() => setStatusFilter(s)}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="project-list">
        {projects.length === 0 ? (
          <p className="muted">Load a root path to see ranked projects.</p>
        ) : filtered.length === 0 ? (
          <p className="muted">No projects match the current filter.</p>
        ) : null}

        {filtered.map((project, index) => (
          <button
            key={project.id}
            className={`project-card ${selectedProjectId === project.id ? "selected" : ""}`}
            onClick={() => onSelect(project.id)}
            type="button"
          >
            <div className="project-rank">{index + 1}</div>
            <div className="project-card-body">
              <div className="project-card-top">
                <h3>{project.name}</h3>
                <span className={`status-pill status-${project.status}`}>
                  {STATUS_LABELS[project.status] ?? project.status}
                </span>
              </div>
              <p className="project-card-score">
                Momentum {project.momentumScore} · Top move {project.topRecommendationType}
              </p>
              <p className="project-card-reason">{project.reasonSnippet}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
