import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { apiFetch } from "../api";

export function AssetDetailPage() {
  const { assetId = "" } = useParams();
  const { data } = useQuery({
    queryKey: ["asset-detail", assetId],
    queryFn: () => apiFetch<any>(`/api/assets/${assetId}`),
    enabled: !!assetId
  });

  if (!data) return <p>Loading...</p>;

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
      <h3>Related Instance IDs</h3>
      <ul>
        {data.instances.map((id: string) => (
          <li key={id}>{id}</li>
        ))}
      </ul>
    </section>
  );
}