import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";
import { Finding, PageMeta } from "../types";
import { VirtualTable } from "../components/VirtualTable";

type FindingPage = { meta: PageMeta; items: Finding[] };

export function FindingsPage({ projectId }: { projectId: string }) {
  const { data } = useQuery({
    queryKey: ["findings", projectId],
    queryFn: () => apiFetch<FindingPage>(`/api/projects/${projectId}/findings?limit=500&offset=0`),
    enabled: !!projectId
  });

  const rows =
    data?.items.map((f) => ({
      severity: f.severity,
      title: f.title,
      scanner: f.scanner,
      view: `open:${f.id}`
    })) || [];

  return (
    <section>
      <h2>Findings</h2>
      <VirtualTable columns={[{ key: "severity", label: "Severity" }, { key: "title", label: "Title" }, { key: "scanner", label: "Scanner" }, { key: "view", label: "Detail" }]} rows={rows} />
      <ul>
        {(data?.items || []).slice(0, 100).map((f) => (
          <li key={f.id}>
            <Link to={`/findings/${f.id}`}>{f.severity.toUpperCase()} - {f.title}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}