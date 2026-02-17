import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { Note, PageMeta } from "../types";

type NotePage = { meta: PageMeta; items: Note[] };

export function NotesPage({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["notes", projectId],
    queryFn: () => apiFetch<NotePage>(`/api/projects/${projectId}/notes?limit=200&offset=0`),
    enabled: !!projectId
  });

  const addNote = useMutation({
    mutationFn: (payload: { title: string; body: string }) =>
      apiFetch(`/api/projects/${projectId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes", projectId] })
  });

  return (
    <section>
      <h2>Notes</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          addNote.mutate({
            title: String(fd.get("title")),
            body: String(fd.get("body"))
          });
          e.currentTarget.reset();
        }}
      >
        <input name="title" placeholder="Title" required />
        <textarea name="body" placeholder="Body" required />
        <button type="submit">Save note</button>
      </form>
      <ul>
        {(data?.items || []).map((n) => (
          <li key={n.id}>
            <strong>{n.title}</strong>
            <p>{n.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}