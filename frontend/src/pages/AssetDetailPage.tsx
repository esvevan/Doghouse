import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "../api";
import { useParams } from "react-router-dom";

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
  const values = ["critical", "high", "medium", "low", "info"];
  let running = 0;
  const segments = values.map((k) => {
    const start = (running / total) * 360;
    running += counts[k] || 0;
    const end = (running / total) * 360;
    return `${SEVERITY_COLOR[k]} ${start}deg ${end}deg`;
  });
  return (
    <div className="pieWrap">
      <div className="pie" style={{ background: `conic-gradient(${segments.join(", ")})` }} />
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

  const saveFindingNote = useMutation({
    mutationFn: async (payload: { instanceId: string; analyst_note: string }) =>
      apiFetch(`/api/instances/${payload.instanceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analyst_note: payload.analyst_note })
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asset-detail", assetId] })
  });

  const addFinding = useMutation({
    mutationFn: async (payload: {
      title: string;
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
      <div className="hostHeader">
        <div>
          <h2>Host Detail: {data.asset.ip}</h2>
          <p><strong>Hostname:</strong> {data.asset.primary_hostname || "Unknown"}</p>
          <p><strong>Operating System:</strong> {data.asset.os_name || "Unknown"}</p>
        </div>
        <SeverityPie counts={counts} />
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
        <details key={sev} className="severityGroup" open>
          <summary>
            {SEVERITY_LABEL[sev]} ({grouped[sev].length})
          </summary>
          <ul>
            {grouped[sev].map((row: any) => (
              <li key={row.instance_id}>
                <details>
                  <summary>
                    <strong>{SEVERITY_LABEL[row.severity]}</strong> {row.title}
                  </summary>
                  <p>Status: {row.status}</p>
                  <p>Service: {row.service_proto ? `${row.service_proto}/${row.service_port}` : "host"}</p>
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
                  </form>
                </details>
              </li>
            ))}
          </ul>
        </details>
      ))}

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
                  severity: String(fd.get("severity") || "info"),
                  description: String(fd.get("description") || ""),
                  finding_detail: String(fd.get("finding_detail") || "")
                });
              }}
            >
              <input name="title" placeholder="Finding Title" required />
              <select name="severity" defaultValue="info">
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="info">Informational</option>
              </select>
              <textarea name="description" placeholder="Finding Description" required />
              <textarea name="finding_detail" placeholder="Finding Detail" required />
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

