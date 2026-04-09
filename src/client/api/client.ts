import type {
  CreateSignalRequest,
  PortfolioResponse,
  ProjectDetail,
  UpdateStatusRequest,
  WatcherStatus
} from "../../shared/domain";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

type ApiErrorShape = {
  error?: {
    code: string;
    message: string;
  };
};

const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorShape;
    throw new Error(body.error?.message ?? "Request failed");
  }

  return response.json() as Promise<T>;
};

export const loadPortfolio = (rootPath: string): Promise<PortfolioResponse> =>
  request<PortfolioResponse>(`${API_BASE}/portfolio/load`, {
    method: "POST",
    body: JSON.stringify({ rootPath })
  });

export const getProject = (rootPath: string, projectId: string): Promise<ProjectDetail> =>
  request<ProjectDetail>(`${API_BASE}/projects/${projectId}?rootPath=${encodeURIComponent(rootPath)}`);

export const refreshProject = (rootPath: string, projectId: string): Promise<ProjectDetail> =>
  request<ProjectDetail>(`${API_BASE}/projects/${projectId}/refresh?rootPath=${encodeURIComponent(rootPath)}`, {
    method: "POST",
    body: JSON.stringify({})
  });

export const createSignal = (
  rootPath: string,
  projectId: string,
  payload: CreateSignalRequest
): Promise<ProjectDetail> =>
  request<ProjectDetail>(`${API_BASE}/projects/${projectId}/signals?rootPath=${encodeURIComponent(rootPath)}`, {
    method: "POST",
    body: JSON.stringify(payload)
  });

export const updateStatus = (
  rootPath: string,
  projectId: string,
  payload: UpdateStatusRequest
): Promise<ProjectDetail> =>
  request<ProjectDetail>(`${API_BASE}/projects/${projectId}/status?rootPath=${encodeURIComponent(rootPath)}`, {
    method: "POST",
    body: JSON.stringify(payload)
  });

export const getWatcherStatus = (rootPath: string): Promise<WatcherStatus> =>
  request<WatcherStatus>(`${API_BASE}/watcher?rootPath=${encodeURIComponent(rootPath)}`);

export const refreshJudgment = (rootPath: string, projectId: string): Promise<ProjectDetail> =>
  request<ProjectDetail>(`${API_BASE}/projects/${projectId}/judgment?rootPath=${encodeURIComponent(rootPath)}`, {
    method: "POST",
    body: JSON.stringify({})
  });
