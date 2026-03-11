import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { apiFetch } from "../api";
import { getToken } from "../token";
import { IngestJob, PageMeta, ToolOutputPreflightItem } from "../types";

type JobPage = { meta: PageMeta; items: IngestJob[] };
type ToolOutputPreflightResponse = { items: ToolOutputPreflightItem[] };

type ResolutionState = {
  action: "confirm_new" | "map_existing" | "cancel";
  asset_id: string;
};

export function DashboardPage({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const toolUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingItems, setPendingItems] = useState<ToolOutputPreflightItem[]>([]);
  const [resolutionState, setResolutionState] = useState<Record<string, ResolutionState>>({});
  const [toolUploadMessage, setToolUploadMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const { data } = useQuery({
    queryKey: ["jobs", projectId],
    queryFn: () => apiFetch<JobPage>(`/api/projects/${projectId}/jobs?limit=50&offset=0`),
    enabled: !!projectId,
    refetchInterval: 2500
  });

  const uploadScan = useMutation({
    mutationFn: async (formData: FormData) => {
      const token = getToken();
      const res = await fetch(`/api/projects/${projectId}/imports`, {
        method: "POST",
        headers: { "X-API-Token": token || "" },
        body: formData
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs", projectId] })
  });

  const uploadToolOutputs = useMutation({
    mutationFn: async (formData: FormData) => {
      const token = getToken();
      const res = await fetch(`/api/projects/${projectId}/tool-outputs/preflight`, {
        method: "POST",
        headers: { "X-API-Token": token || "" },
        body: formData
      });
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as ToolOutputPreflightResponse;
    },
    onSuccess: (response) => {
      toolUploadInputRef.current && (toolUploadInputRef.current.value = "");
      const unresolved = response.items.filter((item) => item.requires_resolution);
      setPendingItems(unresolved);
      const defaults: Record<string, ResolutionState> = {};
      unresolved.forEach((item) => {
        const defaultAction = item.allowed_actions.includes("confirm_new")
          ? "confirm_new"
          : item.allowed_actions.includes("map_existing") && item.candidate_assets.length > 0
            ? "map_existing"
            : "cancel";
        defaults[item.tool_output.id] = {
          action: defaultAction,
          asset_id: item.candidate_assets[0]?.id || ""
        };
      });
      setResolutionState(defaults);
      setToolUploadMessage(
        unresolved.length === 0
          ? { kind: "success", text: "Upload was successful" }
          : { kind: "success", text: "Upload received. Resolve host mapping to finish the upload." }
      );
    },
    onError: (error) => {
      setToolUploadMessage({ kind: "error", text: (error as Error).message || "Upload failed" });
    }
  });

  const resolveToolOutputs = useMutation({
    mutationFn: async (choices?: Array<{ tool_output_id: string; action: string; asset_id: string | null }>) => {
      return apiFetch<{ items: unknown[] }>(`/api/projects/${projectId}/tool-outputs/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          choices ||
            pendingItems.map((item) => ({
            tool_output_id: item.tool_output.id,
            action: resolutionState[item.tool_output.id]?.action || "cancel",
            asset_id: resolutionState[item.tool_output.id]?.asset_id || null
            }))
        )
      });
    },
    onSuccess: () => {
      setPendingItems([]);
      setResolutionState({});
      qc.invalidateQueries({ queryKey: ["assets"] });
      setToolUploadMessage({ kind: "success", text: "Upload was successful" });
    },
    onError: (error) => {
      setToolUploadMessage({ kind: "error", text: (error as Error).message || "Upload failed" });
    }
  });

  return (
    <section>
      <h2>Dashboard</h2>

      <div className="dashboardGrid">
        <div>
          <h3>Import Scan</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              uploadScan.mutate(fd);
            }}
          >
            <input type="file" name="file" required />
            <select name="source_type" defaultValue="nessus">
              <option value="nessus">Nessus</option>
              <option value="nmap">Nmap</option>
            </select>
            <label>
              <input type="checkbox" name="store_source_file" value="true" />
              Store compressed source artifact
            </label>
            <button type="submit" disabled={!projectId || uploadScan.isPending}>
              Import scan
            </button>
          </form>
        </div>

        <div>
          <h3>Upload Tool Output</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const input = form.elements.namedItem("files") as HTMLInputElement | null;
              if (!input?.files?.length) return;
              setToolUploadMessage(null);
              const fd = new FormData();
              Array.from(input.files).forEach((file) => fd.append("files", file));
              uploadToolOutputs.mutate(fd);
            }}
          >
            <input ref={toolUploadInputRef} type="file" name="files" multiple accept=".txt,.json,.xml" required />
            <button type="submit" disabled={!projectId || uploadToolOutputs.isPending}>
              Upload tool output
            </button>
          </form>
          <p className="muted">
            Supports generic text, JSON, and XML outputs from tools like Nikto, Nuclei, NetExec, and similar tooling.
          </p>
          {toolUploadMessage ? (
            <p className={toolUploadMessage.kind === "success" ? "statusSuccess" : "statusError"}>
              {toolUploadMessage.text}
            </p>
          ) : null}
        </div>
      </div>

      <h3>Ingest Jobs</h3>
      <ul>
        {(data?.items || []).map((j) => (
          <li key={j.id}>
            {j.original_filename} [{j.source_type}] - {j.status} ({j.progress}%)
          </li>
        ))}
      </ul>

      {pendingItems.length > 0 ? (
        <div className="modalBackdrop">
          <div className="modalCard">
            <h3>Resolve Tool Output Hosts</h3>
            <p>
              Only the detected target IP is considered for host correlation. Any additional discovered IPs are stored with the upload but are not added to the host list automatically.
            </p>
            {pendingItems.map((item) => {
              const state = resolutionState[item.tool_output.id];
              return (
                <div key={item.tool_output.id} className="resolutionCard">
                  <h4>{item.tool_output.original_filename}</h4>
                  <p><strong>Tool:</strong> {item.tool_output.tool_name}</p>
                  <p><strong>Detected target IP:</strong> {item.tool_output.target_ip || "Not confirmed"}</p>
                  <p><strong>Other discovered IPs:</strong> {item.tool_output.discovered_ips.join(", ") || "None"}</p>
                  <p>{item.message}</p>
                  <div className="resolutionOptions">
                    {item.allowed_actions.includes("confirm_new") ? (
                      <label>
                        <input
                          type="radio"
                          name={`resolution-${item.tool_output.id}`}
                          checked={state?.action === "confirm_new"}
                          onChange={() =>
                            setResolutionState((current) => ({
                              ...current,
                              [item.tool_output.id]: {
                                ...(current[item.tool_output.id] || { asset_id: "" }),
                                action: "confirm_new"
                              }
                            }))
                          }
                        />
                        Confirm new host
                      </label>
                    ) : null}
                    {item.allowed_actions.includes("map_existing") ? (
                      <label>
                        <input
                          type="radio"
                          name={`resolution-${item.tool_output.id}`}
                          checked={state?.action === "map_existing"}
                          onChange={() =>
                            setResolutionState((current) => ({
                              ...current,
                              [item.tool_output.id]: {
                                ...(current[item.tool_output.id] || { asset_id: item.candidate_assets[0]?.id || "" }),
                                action: "map_existing"
                              }
                            }))
                          }
                        />
                        Map to existing host
                      </label>
                    ) : null}
                    <label>
                      <input
                        type="radio"
                        name={`resolution-${item.tool_output.id}`}
                        checked={state?.action === "cancel"}
                        onChange={() =>
                          setResolutionState((current) => ({
                            ...current,
                            [item.tool_output.id]: {
                              ...(current[item.tool_output.id] || { asset_id: "" }),
                              action: "cancel"
                            }
                          }))
                        }
                      />
                      Cancel upload
                    </label>
                  </div>
                  {state?.action === "map_existing" ? (
                    <select
                      value={state.asset_id}
                      onChange={(e) =>
                        setResolutionState((current) => ({
                          ...current,
                          [item.tool_output.id]: {
                            ...(current[item.tool_output.id] || { action: "map_existing" }),
                            asset_id: e.target.value
                          }
                        }))
                      }
                    >
                      {item.candidate_assets.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.ip}{asset.primary_hostname ? ` (${asset.primary_hostname})` : ""}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              );
            })}
            <div className="actionsRow">
              <button type="button" onClick={() => resolveToolOutputs.mutate()} disabled={resolveToolOutputs.isPending}>
                Apply choices
              </button>
              <button
                type="button"
                onClick={() => {
                  resolveToolOutputs.mutate(
                    pendingItems.map((item) => ({
                      tool_output_id: item.tool_output.id,
                      action: "cancel",
                      asset_id: null
                    }))
                  );
                }}
              >
                Cancel unresolved uploads
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
