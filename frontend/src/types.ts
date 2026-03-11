export type PageMeta = { total: number; limit: number; offset: number };

export type Project = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

export type Asset = {
  id: string;
  project_id: string;
  ip: string;
  primary_hostname: string | null;
  tags?: string[];
  os_name?: string | null;
  tested?: boolean;
  open_ports?: number[];
  vuln_counts?: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
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
  tested?: boolean;
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

export type LootCredential = {
  id: string;
  project_id: string;
  username: string | null;
  password: string | null;
  format: string | null;
  hash: string | null;
  host: string | null;
  service: string | null;
  created_at: string;
  updated_at: string;
};

export type ToolOutput = {
  id: string;
  project_id: string;
  asset_id: string | null;
  artifact_id: string | null;
  tool_name: string;
  original_filename: string;
  content_type: string | null;
  target_ip: string | null;
  discovered_ips: string[];
  preview_text: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ToolOutputCandidateAsset = {
  id: string;
  ip: string;
  primary_hostname: string | null;
};

export type ToolOutputPreflightItem = {
  tool_output: ToolOutput;
  attached_asset: ToolOutputCandidateAsset | null;
  candidate_assets: ToolOutputCandidateAsset[];
  requires_resolution: boolean;
  allowed_actions: string[];
  message: string | null;
};
