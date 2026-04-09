import { z } from "zod";

export const projectStatusValues = [
  "active",
  "yet-to-start",
  "cool-down",
  "maintenance-only",
  "archived"
] as const;

export const recommendationActionValues = [
  "build",
  "fix",
  "investigate",
  "reposition",
  "maintenance-only",
  "archive",
  "kill"
] as const;

export const signalTypeValues = ["feedback", "note", "idea", "repo-state"] as const;

export const actorValues = ["ai", "human", "hybrid"] as const;

export const ProjectStatusSchema = z.enum(projectStatusValues);
export const RecommendationActionSchema = z.enum(recommendationActionValues);
export const SignalTypeSchema = z.enum(signalTypeValues);
export const ActorSchema = z.enum(actorValues);

export const ProjectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  status: ProjectStatusSchema,
  lastScannedAt: z.string(),
  topRecommendationType: RecommendationActionSchema,
  momentumScore: z.number(),
  reasonSnippet: z.string()
});

export const SignalSchema = z.object({
  id: z.string(),
  type: SignalTypeSchema,
  source: z.string(),
  summary: z.string(),
  details: z.string().optional(),
  evidenceRefs: z.array(z.string()),
  freshnessScore: z.number(),
  confidence: z.number(),
  createdAt: z.string()
});

export const RecommendationSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  actionType: RecommendationActionSchema,
  title: z.string(),
  rationale: z.string(),
  evidenceRefs: z.array(z.string()),
  confidence: z.number(),
  whatWouldChangeMind: z.string(),
  priorityScore: z.number(),
  createdAt: z.string(),
  heuristicSummary: z.string().optional(),
  hasLlmRationale: z.boolean().optional()
});

export const DecisionEventSchema = z.object({
  id: z.string(),
  actor: ActorSchema,
  kind: z.string(),
  previousState: z.string().optional(),
  newState: z.string(),
  rationale: z.string(),
  evidenceRefs: z.array(z.string()),
  createdAt: z.string()
});

export const ProjectStatusRecordSchema = z.object({
  status: ProjectStatusSchema,
  activeRecommendationId: z.string().default(""),
  currentConfidence: z.number().default(0),
  lastUpdatedAt: z.string().default(""),
  lastScannedAt: z.string().default("")
});

export const WatcherStatusSchema = z.object({
  rootPath: z.string(),
  active: z.boolean(),
  watchedProjectCount: z.number(),
  mode: z.enum(["idle", "watching", "error"]),
  lastEventAt: z.string().optional(),
  lastEventPath: z.string().optional(),
  lastRefreshAt: z.string().optional(),
  errorMessage: z.string().optional()
});

export const PortfolioResponseSchema = z.object({
  rootPath: z.string(),
  generatedAt: z.string(),
  projects: z.array(ProjectSummarySchema),
  watcherStatus: WatcherStatusSchema.optional()
});

export const ProjectDetailSchema = z.object({
  rootPath: z.string(),
  project: ProjectSummarySchema,
  thesisMarkdown: z.string(),
  agentBriefMarkdown: z.string(),
  signals: z.array(SignalSchema),
  recommendations: z.array(RecommendationSchema),
  decisionHistory: z.array(DecisionEventSchema),
  nextTaskMarkdown: z.string(),
  updatedAt: z.string()
});

export const LoadPortfolioRequestSchema = z.object({
  rootPath: z.string().min(1)
});

export const CreateSignalRequestSchema = z.object({
  type: z.enum(["feedback", "note", "idea"]),
  source: z.string().min(1).default("manual"),
  summary: z.string().min(3),
  details: z.string().optional()
});

export const UpdateStatusRequestSchema = z.object({
  status: ProjectStatusSchema,
  actor: ActorSchema.default("human"),
  rationale: z.string().min(3)
});

export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type RecommendationAction = z.infer<typeof RecommendationActionSchema>;
export type SignalType = z.infer<typeof SignalTypeSchema>;
export type Actor = z.infer<typeof ActorSchema>;
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;
export type SignalRecord = z.infer<typeof SignalSchema>;
export type Recommendation = z.infer<typeof RecommendationSchema>;
export type DecisionEvent = z.infer<typeof DecisionEventSchema>;
export type ProjectStatusRecord = z.infer<typeof ProjectStatusRecordSchema>;
export type WatcherStatus = z.infer<typeof WatcherStatusSchema>;
export type PortfolioResponse = z.infer<typeof PortfolioResponseSchema>;
export type ProjectDetail = z.infer<typeof ProjectDetailSchema>;
export type LoadPortfolioRequest = z.infer<typeof LoadPortfolioRequestSchema>;
export type CreateSignalRequest = z.infer<typeof CreateSignalRequestSchema>;
export type UpdateStatusRequest = z.infer<typeof UpdateStatusRequestSchema>;
