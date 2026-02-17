export type PageMeta = { total: number; limit: number; offset: number };

export type Project = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

export type Asset = {
  id: string;
  ip: string;
  primary_hostname: string | null;
  hostnames: string[];
  tags: string[];
  first_seen: string;
  last_seen: string;
};

export type Service = {
  id: string;
  asset_id: string;
  proto: string;
  port: number;
  name: string | null;
  product: string | null;
  version: string | null;
  banner: string | null;
  first_seen: string;
  last_seen: string;
};

export type Finding = {
  id: string;
  finding_key: string;
  title: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  description: string | null;
  remediation: string | null;
  scanner: string;
  scanner_id: string | null;
};

export type Instance = {
  id: string;
  finding_id: string;
  asset_id: string;
  service_id: string | null;
  status: "open" | "closed" | "accepted" | "false_positive";
  evidence_snippet: string | null;
  first_seen: string;
  last_seen: string;
};

export type IngestJob = {
  id: string;
  project_id: string;
  source_type: string;
  original_filename: string;
  status: string;
  progress: number;
  stats: Record<string, unknown>;
  error: string | null;
};

export type Note = {
  id: string;
  project_id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
};