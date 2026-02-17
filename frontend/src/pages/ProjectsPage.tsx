import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { Project } from "../types";

export function ProjectsPage({ onSelect }: { onSelect: (id: string) => void }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiFetch<Project[]>("/api/projects")
  });

  const createProject = useMutation({
    mutationFn: (payload: { name: string; description?: string }) =>
      apiFetch<Project>("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] })
  });

  return (
    <section>
      <h2>Projects</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          createProject.mutate({
            name: String(fd.get("name")),
            description: String(fd.get("description") || "")
          });
          e.currentTarget.reset();
        }}
      >
        <input name="name" placeholder="Project name" required />
        <input name="description" placeholder="Description" />
        <button type="submit">Create</button>
      </form>
      <ul>
        {data.map((p) => (
          <li key={p.id}>
            <button onClick={() => onSelect(p.id)}>{p.name}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}