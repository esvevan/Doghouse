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
  const deleteFindingInstance = useMutation({
    mutationFn: async (instanceId: string) =>
      apiFetch<void>(`/api/instances/${instanceId}`, {
        method: "DELETE"
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asset-detail", assetId] })
  });
  const toggleFlag = useMutation({
    mutationFn: async (payload: { instanceId: string; flagged_for_testing: boolean }) =>
      apiFetch(`/api/instances/${payload.instanceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagged_for_testing: payload.flagged_for_testing })
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
        <details key={sev} className="severityGroup" open>
          <summary>
            {SEVERITY_LABEL[sev]} ({grouped[sev].length})
          </summary>
          <ul>
            {grouped[sev].map((row: any) => (
              <li key={row.instance_id}>
                <details>
                  <summary>
                    <button
                      className="flagBtn"
                      title="Flag for future testing"
                      onClick={(e) => {
                        e.preventDefault();
                        const nextFlag = !row.flagged_for_testing;
                        toggleFlag.mutate({ instanceId: row.instance_id, flagged_for_testing: nextFlag });
                        if (nextFlag) {
                          const marker = `Need to test \"${row.title}\"`;
                          const currentNote = String(data.asset.note || "");
                          if (!currentNote.includes(marker)) {
                            const nextNote = currentNote ? `${currentNote}\n${marker}` : marker;
                            saveHostNote.mutate({ assetId, note: nextNote });
                          }
                        }
                      }}
                    >
                      ⚑
                    </button>
                    <strong className={row.flagged_for_testing ? "findingFlagged" : ""}>
                      {SEVERITY_LABEL[row.severity]} {row.title}
                    </strong>
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
