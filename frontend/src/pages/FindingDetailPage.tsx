import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { apiFetch } from "../api";

export function FindingDetailPage() {
  const { findingId = "" } = useParams();
  const { data } = useQuery({
    queryKey: ["finding-detail", findingId],
    queryFn: () => apiFetch<any>(`/api/findings/${findingId}`),
    enabled: !!findingId
  });

  if (!data) return <p>Loading...</p>;

  return (
    <section>
      <h2>{data.title}</h2>
      <p>Severity: {data.severity}</p>
      <p>{data.description}</p>
      <h3>Instances</h3>
      <ul>
        {data.instances.map((i: any) => (
          <li key={i.id}>
            {i.asset_id} / {i.service_id || "host"} / {i.status}
          </li>
        ))}
      </ul>
    </section>
  );
}