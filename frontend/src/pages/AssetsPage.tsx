import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";
import { Asset, PageMeta } from "../types";

type AssetPage = { meta: PageMeta; items: Asset[] };

export function AssetsPage({ projectId }: { projectId: string }) {
  const { data, error, isLoading } = useQuery({
    queryKey: ["assets", projectId],
    queryFn: () => apiFetch<AssetPage>(`/api/projects/${projectId}/assets?limit=500&offset=0`),
    enabled: !!projectId
  });

  return (
    <section>
      <h2>Assets</h2>
      {isLoading ? <p>Loading assets...</p> : null}
      {error ? <p>Failed to load assets: {(error as Error).message}</p> : null}
      <p>Discovered hosts: {data?.meta.total ?? 0}</p>
      <table>
        <thead>
          <tr>
            <th>IP</th>
            <th>Hostname</th>
            <th>Last Seen</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {(data?.items || []).map((a) => (
            <tr key={a.id}>
              <td>
                <Link to={`/assets/${a.id}`}>{a.ip}</Link>
              </td>
              <td>{a.primary_hostname || ""}</td>
              <td>{a.last_seen}</td>
              <td>
                <Link to={`/assets/${a.id}`}>Open</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
