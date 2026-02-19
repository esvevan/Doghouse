import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";
import { Asset, PageMeta } from "../types";

type AssetPage = { meta: PageMeta; items: Asset[] };

function VulnBar({ counts }: { counts: { critical: number; high: number; medium: number; low: number; info: number } }) {
  const total = counts.critical + counts.high + counts.medium + counts.low + counts.info;
  if (total === 0) {
    return <span>None</span>;
  }
  const parts = [
    { key: "critical", value: counts.critical, color: "#d32f2f" },
    { key: "high", value: counts.high, color: "#f57c00" },
    { key: "medium", value: counts.medium, color: "#fbc02d" },
    { key: "low", value: counts.low, color: "#1976d2" },
    { key: "info", value: counts.info, color: "#388e3c" }
  ];
  return (
    <div>
      <div style={{ display: "flex", width: "220px", height: "12px", border: "1px solid #ccc" }}>
        {parts.map((p) => (
          <div key={p.key} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <small>
        C:{counts.critical} H:{counts.high} M:{counts.medium} L:{counts.low} I:{counts.info}
      </small>
    </div>
  );
}

export function AssetsPage({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { data, error, isLoading } = useQuery({
    queryKey: ["assets", projectId],
    queryFn: () => apiFetch<AssetPage>(`/api/projects/${projectId}/assets?limit=500&offset=0`),
    enabled: !!projectId
  });

  const patchAsset = useMutation({
    mutationFn: (payload: { assetId: string; body: Record<string, unknown> }) =>
      apiFetch(`/api/assets/${payload.assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload.body)
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assets", projectId] })
  });

  const editTextField = (assetId: string, field: string, currentValue: string) => {
    const next = window.prompt(`Edit ${field}`, currentValue) ?? currentValue;
    if (next !== currentValue) {
      patchAsset.mutate({ assetId, body: { [field]: next } });
    }
  };

  const editPorts = (assetId: string, currentPorts: number[]) => {
    const current = currentPorts.join(",");
    const next = window.prompt("Edit open ports (comma separated)", current) ?? current;
    if (next === current) return;
    const parsed = next
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x.length > 0)
      .map((x) => Number(x))
      .filter((x) => Number.isInteger(x) && x > 0 && x <= 65535);
    patchAsset.mutate({ assetId, body: { open_ports_override: parsed } });
  };

  return (
    <section>
      <h2>Hosts</h2>
      {isLoading ? <p>Loading assets...</p> : null}
      {error ? <p>Failed to load assets: {(error as Error).message}</p> : null}
      <p>Discovered hosts: {data?.meta.total ?? 0}</p>
      <table>
        <thead>
          <tr>
            <th>Tested</th>
            <th>IP</th>
            <th>Hostname</th>
            <th>Operating System</th>
            <th>Open Ports</th>
            <th>Vulnerabilities</th>
          </tr>
        </thead>
        <tbody>
          {(data?.items || []).map((a) => (
            <tr key={a.id}>
              <td>
                <input
                  type="checkbox"
                  checked={!!a.tested}
                  onChange={(e) => patchAsset.mutate({ assetId: a.id, body: { tested: e.target.checked } })}
                />
                <button className="iconBtn" onClick={() => patchAsset.mutate({ assetId: a.id, body: { tested: !a.tested } })} title="Edit tested">
                  &#9998;
                </button>
              </td>
              <td>
                <Link to={`/assets/${a.id}`}>{a.ip}</Link>{" "}
                <button className="iconBtn" onClick={() => editTextField(a.id, "ip", a.ip)} title="Edit IP">&#9998;</button>
              </td>
              <td>
                {a.primary_hostname || ""}{" "}
                <button
                  className="iconBtn"
                  onClick={() => editTextField(a.id, "primary_hostname", a.primary_hostname || "")}
                  title="Edit hostname"
                >
                  &#9998;
                </button>
              </td>
              <td>
                {a.os_name || ""}{" "}
                <button className="iconBtn" onClick={() => editTextField(a.id, "os_name", a.os_name || "")} title="Edit operating system">&#9998;</button>
              </td>
              <td>
                {(a.open_ports || []).join(", ")}{" "}
                <button className="iconBtn" onClick={() => editPorts(a.id, a.open_ports || [])} title="Edit open ports">&#9998;</button>
              </td>
              <td>
                <VulnBar
                  counts={a.vuln_counts || { critical: 0, high: 0, medium: 0, low: 0, info: 0 }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
