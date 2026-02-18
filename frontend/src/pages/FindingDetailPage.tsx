import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { apiFetch } from "../api";

export function FindingDetailPage() {
  const { findingId = "" } = useParams();
  const { data, error, isLoading } = useQuery({
    queryKey: ["finding-detail", findingId],
    queryFn: () => apiFetch<any>(`/api/findings/${findingId}`),
    enabled: !!findingId
  });

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Failed to load finding detail: {(error as Error).message}</p>;
  if (!data) return <p>No finding data.</p>;

  return (
    <section>
      <h2>{data.title}</h2>
      <p>Severity: {data.severity}</p>
      <p>{data.description}</p>
      <h3>Instances</h3>
      <ul>
        {data.instances.map((i: any) => (
          <li key={i.id}>
            <strong>{i.asset_ip}</strong> {i.asset_primary_hostname ? `(${i.asset_primary_hostname})` : ""} /{" "}
            {i.service_proto ? `${i.service_proto}/${i.service_port}` : "host"} / {i.status}
            <pre>{i.evidence_snippet || "No plugin output"}</pre>
          </li>
        ))}
      </ul>
    </section>
  );
}
