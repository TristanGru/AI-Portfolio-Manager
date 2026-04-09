import type { ProjectDetail, ProjectStatus } from "../../shared/domain";
import { MarkdownDocument } from "./MarkdownDocument";
import { SignalComposer } from "./SignalComposer";

type Props = {
  detail?: ProjectDetail;
  loading: boolean;
  error?: string;
  judgmentLoading: boolean;
  onRefreshJudgment: () => Promise<void>;
  onCreateSignal: (payload: { type: "feedback" | "note" | "idea"; source: string; summary: string; details?: string }) => Promise<void>;
  onUpdateStatus: (status: ProjectStatus) => Promise<void>;
};

export function ProjectDetailPanel({
  detail,
  loading,
  error,
  judgmentLoading,
  onRefreshJudgment,
  onCreateSignal,
  onUpdateStatus
}: Props) {
  const topRecommendation = detail?.recommendations[0];

  return (
    <section className="panel detail-panel">
      <div className="panel-header panel-header-spread">
        <div>
          <p className="eyebrow">Project Layer</p>
          <h2>{detail?.project.name ?? "Choose a project"}</h2>
        </div>

        {detail ? (
          <div className="detail-actions">
            <button
              type="button"
              onClick={() => void onRefreshJudgment()}
              disabled={judgmentLoading}
            >
              {judgmentLoading ? "Analyzing..." : "Refresh Judgment"}
            </button>
            <select
              aria-label="Project status"
              value={detail.project.status}
              onChange={(event) => void onUpdateStatus(event.target.value as ProjectStatus)}
            >
              <option value="active">Active</option>
              <option value="yet-to-start">Yet to start</option>
              <option value="cool-down">Cool-down</option>
              <option value="maintenance-only">Maintenance only</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        ) : null}
      </div>

      {loading ? <p className="muted">Loading project memory...</p> : null}
      {error ? <p className="error-banner">{error}</p> : null}

      {!detail && !loading ? (
        <p className="muted">Pick a project from the portfolio layer to inspect its thesis and next move.</p>
      ) : null}

      {detail ? (
        <div className="detail-grid">
          <article className="card emphasis-card">
            <p className="eyebrow">Current Recommendation</p>
            <h3>{topRecommendation?.actionType ?? "No recommendation"}</h3>
            {topRecommendation ? (
              <>
                <p>{topRecommendation.rationale}</p>
                {!topRecommendation.hasLlmRationale && (
                  <p className="no-judgment-placeholder">
                    Heuristic analysis only — click Refresh Judgment for AI reasoning.
                  </p>
                )}
              </>
            ) : (
              <p className="no-judgment-placeholder">
                No judgment yet — click Refresh Judgment to analyze this project.
              </p>
            )}
            {topRecommendation?.heuristicSummary ? (
              <p className="meta-line heuristic-summary">{topRecommendation.heuristicSummary}</p>
            ) : (
              <p className="meta-line">
                Confidence {Math.round((topRecommendation?.confidence ?? 0) * 100)}% · Score{" "}
                {topRecommendation?.priorityScore.toFixed(2)}
              </p>
            )}
            <h4>What would change its mind</h4>
            <p>{topRecommendation?.whatWouldChangeMind}</p>
          </article>

          <article className="card">
            <p className="eyebrow">Project Thesis</p>
            <MarkdownDocument className="markdown-block" content={detail.thesisMarkdown} skipTopLevelHeading />
          </article>

          <article className="card">
            <p className="eyebrow">Next Task</p>
            <MarkdownDocument className="markdown-block" content={detail.nextTaskMarkdown} skipTopLevelHeading />
          </article>

          <article className="card">
            <p className="eyebrow">Coding Agent Brief</p>
            <MarkdownDocument className="markdown-block" content={detail.agentBriefMarkdown} skipTopLevelHeading />
          </article>

          <article className="card">
            <p className="eyebrow">Signal Composer</p>
            <SignalComposer onSubmit={onCreateSignal} />
          </article>

          <article className="card">
            <p className="eyebrow">Recent Signals</p>
            <ul className="stack-list">
              {detail.signals.slice(0, 8).map((signal) => (
                <li key={signal.id}>
                  <strong>{signal.type}</strong>: {signal.summary}
                </li>
              ))}
            </ul>
          </article>

          <article className="card">
            <p className="eyebrow">Decision History</p>
            <ul className="stack-list">
              {detail.decisionHistory.length === 0 ? <li>No decisions recorded yet.</li> : null}
              {detail.decisionHistory.map((decision) => (
                <li key={decision.id}>
                  <strong>{decision.newState}</strong>: {decision.rationale}
                </li>
              ))}
            </ul>
          </article>
        </div>
      ) : null}
    </section>
  );
}
