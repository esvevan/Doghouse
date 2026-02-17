import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { getToken } from "../token";
import { IngestJob, PageMeta } from "../types";

type JobPage = { meta: PageMeta; items: IngestJob[] };

export function DashboardPage({ projectId }: { projectId: string }) {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["jobs", projectId],
    queryFn: () => apiFetch<JobPage>(`/api/projects/${projectId}/jobs?limit=50&offset=0`),
    enabled: !!projectId,
    refetchInterval: 2500
  });

  const upload = useMutation({
    mutationFn: async (formData: FormData) => {
      const token = getToken();
      const res = await fetch(`/api/projects/${projectId}/imports`, {
        method: "POST",
        headers: { "X-API-Token": token || "" },
        body: formData
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs", projectId] })
  });

  return (
    <section>
      <h2>Dashboard</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          upload.mutate(fd);
        }}
      >
        <input type="file" name="file" required />
        <select name="source_type" defaultValue="nessus">
          <option value="nessus">Nessus</option>
          <option value="nmap">Nmap</option>
        </select>
        <label>
          <input type="checkbox" name="store_source_file" value="true" />
          Store compressed source artifact
        </label>
        <button type="submit" disabled={!projectId}>
          Import scan
        </button>
      </form>

      <h3>Ingest Jobs</h3>
      <ul>
        {(data?.items || []).map((j) => (
          <li key={j.id}>
            {j.original_filename} [{j.source_type}] - {j.status} ({j.progress}%)
          </li>
        ))}
      </ul>
    </section>
  );
}