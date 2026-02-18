import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { apiFetch } from "../api";

export function AssetDetailPage() {
  const { assetId = "" } = useParams();
  const { data, error, isLoading } = useQuery({
    queryKey: ["asset-detail", assetId],
    queryFn: () => apiFetch<any>(`/api/assets/${assetId}`),
    enabled: !!assetId
  });

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Failed to load asset detail: {(error as Error).message}</p>;
  if (!data) return <p>No asset data.</p>;

  return (
    <section>
      <h2>Asset Detail: {data.asset.ip}</h2>
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
        {data.findings.map((row: any) => (
          <li key={row.instance_id}>
            <strong>{row.severity.toUpperCase()}</strong> {row.title} [{row.status}]{" "}
            on {row.service_proto ? `${row.service_proto}/${row.service_port}` : "host"}
            <pre>{row.evidence_snippet || "No plugin output"}</pre>
          </li>
        ))}
      </ul>
    </section>
  );
}
