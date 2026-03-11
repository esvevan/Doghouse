import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "../api";
import { useParams } from "react-router-dom";
import { getToken } from "../token";

const SEVERITY_ORDER: Record<string, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Informational"
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#d32f2f",
  high: "#f57c00",
  medium: "#fbc02d",
  low: "#1976d2",
  info: "#388e3c"
};

function SeverityPie({ counts }: { counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return <div className="pieWrap">No findings</div>;
  const values = ["critical", "high", "medium", "low", "info"] as const;
  const size = 468;
  const cx = size / 2;
  const cy = size / 2;
  const r = 182;
  let running = 0;
  const slices = values.map((k) => {
    const value = counts[k] || 0;
    const start = running / total;
    running += value;
    const end = running / total;
    return { key: k, value, start, end };
  });
  const polar = (frac: number, radius: number) => {
    const angle = frac * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  };
  const arcPath = (start: number, end: number) => {
    const s = polar(start, r);
    const e = polar(end, r);
    const largeArc = end - start > 0.5 ? 1 : 0;
    return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y} Z`;
  };
  return (
    <div className="pieWrap">
      <svg className="pieSvg" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Finding severity summary">
        {slices
          .filter((s) => s.value > 0)
          .map((s) => (
            <path key={s.key} d={arcPath(s.start, s.end)} fill={SEVERITY_COLOR[s.key]} stroke="#fff" strokeWidth="1" />
          ))}
      </svg>
      <small>
        C:{counts.critical || 0} H:{counts.high || 0} M:{counts.medium || 0} L:{counts.low || 0} I:{counts.info || 0}
      </small>
    </div>
  );
}

export function AssetDetailPage() {
  const qc = useQueryClient();
  const { assetId = "" } = useParams();
  const [showModal, setShowModal] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [toolOutputMessage, setToolOutputMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const { data, error, isLoading } = useQuery({
    queryKey: ["asset-detail", assetId],
    queryFn: () => apiFetch<any>(`/api/assets/${assetId}`),
    enabled: !!assetId
  });

  const saveHostNote = useMutation({
    mutationFn: async (payload: { assetId: string; note: string }) =>
      apiFetch(`/api/assets/${payload.assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: payload.note })
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asset-detail", assetId] })
  });
  const saveTags = useMutation({
    mutationFn: async (payload: { assetId: string; tags: string[] }) =>
      apiFetch(`/api/assets/${payload.assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: payload.tags })
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asset-detail", assetId] });
      qc.invalidateQueries({ queryKey: ["assets"] });
    }
  });

  const saveFindingNote = useMutation({
    mutationFn: async (payload: { instanceId: string; analyst_note: string }) =>
      apiFetch(`/api/instances/${payload.instanceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analyst_note: payload.analyst_note })
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asset-detail", assetId] })
  });
  const deleteFindingInstance = useMutation({
    mutationFn: async (instanceId: string) =>
      apiFetch<void>(`/api/instances/${instanceId}`, {
        method: "DELETE"
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asset-detail", assetId] })
  });

  const addFinding = useMutation({
    mutationFn: async (payload: {
      title: string;
      service: string;
      severity: string;
      description: string;
      finding_detail: string;
    }) =>
      apiFetch(`/api/assets/${assetId}/findings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }),
    onSuccess: () => {
      setShowModal(false);
      qc.invalidateQueries({ queryKey: ["asset-detail", assetId] });
    }
  });

  const uploadToolOutputs = useMutation({
    mutationFn: async (files: FileList) => {
      const token = getToken();
      const fd = new FormData();
      Array.from(files).forEach((file) => fd.append("files", file));
      const res = await fetch(`/api/assets/${assetId}/tool-outputs`, {
        method: "POST",
        headers: { "X-API-Token": token || "" },
        body: fd
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      setToolOutputMessage({ kind: "success", text: "Upload was successful" });
      qc.invalidateQueries({ queryKey: ["asset-detail", assetId] });
    },
    onError: (error) => {
      setToolOutputMessage({ kind: "error", text: (error as Error).message || "Upload failed" });
    }
  });

  const deleteToolOutput = useMutation({
    mutationFn: async (toolOutputId: string) =>
      apiFetch<void>(`/api/tool-outputs/${toolOutputId}`, {
        method: "DELETE"
      }),
    onSuccess: () => {
      setToolOutputMessage({ kind: "success", text: "Tool output deleted" });
      qc.invalidateQueries({ queryKey: ["asset-detail", assetId] });
    },
    onError: (error) => {
      setToolOutputMessage({ kind: "error", text: (error as Error).message || "Delete failed" });
    }
  });

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Failed to load host detail: {(error as Error).message}</p>;
  if (!data) return <p>No host data.</p>;

  const findings = [...(data.findings || [])].sort(
    (a: any, b: any) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0)
  );
  const grouped: Record<string, any[]> = { critical: [], high: [], medium: [], low: [], info: [] };
  findings.forEach((f: any) => grouped[f.severity]?.push(f));
  const counts = {
    critical: grouped.critical.length,
    high: grouped.high.length,
    medium: grouped.medium.length,
    low: grouped.low.length,
    info: grouped.info.length
  };

  return (
    <section>
      <div className="hostTopGrid">
        <div className="hostTopLeft">
          <h2>Host Detail: {data.asset.ip}</h2>
          <p><strong>Hostname:</strong> {data.asset.primary_hostname || "Unknown"}</p>
          <p><strong>Operating System:</strong> {data.asset.os_name || "Unknown"}</p>
          <div>
            <strong>Tags:</strong>{" "}
            {(data.asset.tags || []).length > 0 ? (
              <span>
                {(data.asset.tags || []).map((tag: string) => (
                  <span key={tag} className="tagChip">
                    {tag}
                    <button
                      type="button"
                      className="tagRemoveBtn"
                      title={`Remove tag ${tag}`}
                      onClick={() => {
                        const next = (data.asset.tags || []).filter((t: string) => t !== tag);
                        saveTags.mutate({ assetId, tags: next });
                      }}
                    >
                      x
                    </button>
                  </span>
                ))}
              </span>
            ) : (
              "None"
            )}
          </div>
          <div>
            <label>Add Tag</label>
            <div>
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Enter host tag"
              />
              <button
                type="button"
                onClick={() => {
                  const value = tagInput.trim();
                  if (!value) return;
                  const next = Array.from(new Set([...(data.asset.tags || []), value]));
                  saveTags.mutate({ assetId, tags: next });
                  setTagInput("");
                }}
              >
                Add Tag
              </button>
            </div>
          </div>
          <h3>Host Note</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              saveHostNote.mutate({ assetId, note: String(fd.get("note") || "") });
            }}
          >
            <textarea
              name="note"
              placeholder="Add note to this host"
              defaultValue={data.asset.note || ""}
              style={{ width: "1258px", height: "207px" }}
            />
            <button type="submit">Save note</button>
          </form>
        </div>
        <div className="hostTopRight">
          <SeverityPie counts={counts} />
        </div>
      </div>

      <h3>Services</h3>
      <ul>
        {data.services.map((s: any) => (
          <li key={s.id}>
            {s.proto}/{s.port} {s.name || ""}
          </li>
        ))}
      </ul>

      <div className="findingsHeader">
        <h3>Related Findings</h3>
        <button onClick={() => setShowModal(true)}>Add finding to host</button>
      </div>

      {(["critical", "high", "medium", "low", "info"] as const).map((sev) => (
        <details key={sev} className="severityGroup">
          <summary>
            {SEVERITY_LABEL[sev]} ({grouped[sev].length})
          </summary>
          <ul>
            {grouped[sev].map((row: any) => (
              <li key={row.instance_id}>
                <details>
                  <summary>
                    <strong>{SEVERITY_LABEL[row.severity]} {row.title}</strong>
                  </summary>
                  <p>Service: {row.service_proto ? `${row.service_proto}/${row.service_port}` : "host"}</p>
                  <p>Description: {row.description || "No description provided."}</p>
                  <pre>{row.evidence_snippet || "No plugin output"}</pre>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      saveFindingNote.mutate({
                        instanceId: row.instance_id,
                        analyst_note: String(fd.get("analyst_note") || "")
                      });
                    }}
                  >
                    <textarea
                      name="analyst_note"
                      placeholder="Add note for this finding instance"
                      defaultValue={row.analyst_note || ""}
                      style={{ width: "881px", height: "99px" }}
                    />
                    <button type="submit">Save finding note</button>
                    <button
                      type="button"
                      onClick={() => deleteFindingInstance.mutate(row.instance_id)}
                    >
                      Delete finding from host
                    </button>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        </details>
      ))}

      <div className="toolOutputSection">
        <div className="findingsHeader">
          <h3>Tool Output</h3>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const input = e.currentTarget.elements.namedItem("files") as HTMLInputElement | null;
            if (!input?.files?.length) return;
            setToolOutputMessage(null);
            uploadToolOutputs.mutate(input.files);
            input.value = "";
          }}
        >
          <input type="file" name="files" multiple accept=".txt,.json,.xml" />
          <button type="submit" disabled={uploadToolOutputs.isPending}>Upload tool output</button>
        </form>
        {toolOutputMessage ? (
          <p className={toolOutputMessage.kind === "success" ? "statusSuccess" : "statusError"}>
            {toolOutputMessage.text}
          </p>
        ) : null}
        {(data.tool_outputs || []).length === 0 ? <p>No tool output uploaded for this host.</p> : null}
        {(data.tool_outputs || []).map((output: any) => (
          <details key={output.id} className="toolOutputCard">
            <summary>
              <strong>{output.tool_name}</strong> - {output.original_filename}
            </summary>
            <p><strong>Target IP:</strong> {output.target_ip || data.asset.ip}</p>
            <p><strong>Other discovered IPs:</strong> {(output.discovered_ips || []).join(", ") || "None"}</p>
            <pre>{output.preview_text || "No preview available."}</pre>
            <button type="button" onClick={() => deleteToolOutput.mutate(output.id)} disabled={deleteToolOutput.isPending}>
              Delete tool output
            </button>
          </details>
        ))}
      </div>

      {showModal ? (
        <div className="modalBackdrop">
          <div className="modalCard">
            <h3>Add finding to host</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                addFinding.mutate({
                  title: String(fd.get("title") || ""),
                  service: String(fd.get("service") || ""),
                  severity: String(fd.get("severity") || "info"),
                  description: String(fd.get("description") || ""),
                  finding_detail: String(fd.get("finding_detail") || "")
                });
              }}
              className="modalForm"
            >
              <label>Finding Title</label>
              <input name="title" required />
              <label>Service</label>
              <input name="service" />
              <label>Criticality</label>
              <select name="severity" defaultValue="info">
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="info">Informational</option>
              </select>
              <label>Description</label>
              <textarea name="description" required />
              <label>Finding Detail</label>
              <textarea name="finding_detail" required />
              <div>
                <button type="submit">Add Finding</button>
                <button type="button" onClick={() => setShowModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
