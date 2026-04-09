import { useState, type FormEvent } from "react";
import type { CreateSignalRequest } from "../../shared/domain";

type Props = {
  onSubmit: (payload: CreateSignalRequest) => Promise<void>;
};

export function SignalComposer({ onSubmit }: Props) {
  const [type, setType] = useState<CreateSignalRequest["type"]>("feedback");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      await onSubmit({
        type,
        source: "manual",
        summary,
        details: details || undefined
      });
      setSummary("");
      setDetails("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="signal-form" onSubmit={handleSubmit}>
      <div className="field-row">
        <label>
          Type
          <select value={type} onChange={(event) => setType(event.target.value as CreateSignalRequest["type"])}>
            <option value="feedback">Feedback</option>
            <option value="note">Note</option>
            <option value="idea">Idea</option>
          </select>
        </label>
        <button type="submit" disabled={submitting || summary.trim().length < 3}>
          {submitting ? "Writing..." : "Add Signal"}
        </button>
      </div>

      <label>
        Summary
        <input
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          placeholder="What changed, what hurts, or what looks tempting?"
        />
      </label>

      <label>
        Details
        <textarea
          rows={4}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          placeholder="Optional context for the recommendation engine"
        />
      </label>
    </form>
  );
}
