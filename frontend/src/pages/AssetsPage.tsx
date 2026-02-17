import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";
import { Asset, PageMeta } from "../types";
import { VirtualTable } from "../components/VirtualTable";

type AssetPage = { meta: PageMeta; items: Asset[] };

export function AssetsPage({ projectId }: { projectId: string }) {
  const { data } = useQuery({
    queryKey: ["assets", projectId],
    queryFn: () => apiFetch<AssetPage>(`/api/projects/${projectId}/assets?limit=500&offset=0`),
    enabled: !!projectId
  });

  const rows =
    data?.items.map((a) => ({
      ip: a.ip,
      primary_hostname: a.primary_hostname || "",
      last_seen: a.last_seen,
      view: `open:${a.id}`
    })) || [];

  return (
    <section>
      <h2>Assets</h2>
      <VirtualTable columns={[{ key: "ip", label: "IP" }, { key: "primary_hostname", label: "Hostname" }, { key: "last_seen", label: "Last Seen" }, { key: "view", label: "Detail" }]} rows={rows} />
      <ul>
        {(data?.items || []).slice(0, 100).map((a) => (
          <li key={a.id}>
            <Link to={`/assets/${a.id}`}>{a.ip}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}