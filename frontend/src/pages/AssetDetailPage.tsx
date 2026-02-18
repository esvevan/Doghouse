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
  const createNote = useMutation({
    mutationFn: async (payload: { projectId: string; title: string; body: string }) =>
      apiFetch(`/api/projects/${payload.projectId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: payload.title, body: payload.body })
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
      <h3>Add Asset Note</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          createNote.mutate({
            projectId: data.asset.project_id,
            title: `Asset ${data.asset.ip}: ${String(fd.get("title"))}`,
            body: String(fd.get("body"))
          });
          e.currentTarget.reset();
        }}
      >
        <input name="title" placeholder="Note title" required />
        <textarea name="body" placeholder="Asset note" required />
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
                  createNote.mutate({
                    projectId: data.asset.project_id,
                    title: `Finding note ${data.asset.ip}: ${row.title}`,
                    body: String(fd.get("body"))
                  });
                  e.currentTarget.reset();
                }}
              >
                <textarea name="body" placeholder="Add note for this finding instance" required />
                <button type="submit">Save finding note</button>
              </form>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
