import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { apiFetch } from "../api";

const SEVERITY_ORDER: Record<string, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1
};

function severityLabel(value: string): string {
  if (value === "info") return "informational";
  return value;
}

export function AssetDetailPage() {
  const qc = useQueryClient();
  const { assetId = "" } = useParams();
  const { data, error, isLoading } = useQuery({
    queryKey: ["asset-detail", assetId],
    queryFn: () => apiFetch<any>(`/api/assets/${assetId}`),
    enabled: !!assetId
  });
  const saveAssetNote = useMutation({
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

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Failed to load asset detail: {(error as Error).message}</p>;
  if (!data) return <p>No asset data.</p>;
  const findings = [...(data.findings || [])].sort(
    (a: any, b: any) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0)
  );

  return (
    <section>
      <h2>Asset Detail: {data.asset.ip}</h2>
      <h3>Asset Note</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          saveAssetNote.mutate({
            assetId,
            note: String(fd.get("note") || "")
          });
        }}
      >
        <textarea name="note" placeholder="Add note to this asset" defaultValue={data.asset.note || ""} />
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
      <h3>Related Findings</h3>
      <ul>
        {findings.map((row: any) => (
          <li key={row.instance_id}>
            <details>
              <summary>
                <strong>{severityLabel(row.severity).toUpperCase()}</strong> {row.title}
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
                />
                <button type="submit">Save finding note</button>
              </form>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
