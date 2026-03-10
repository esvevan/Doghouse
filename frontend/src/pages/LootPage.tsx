import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "../api";
import { LootCredential, PageMeta } from "../types";

type LootResponse = {
  meta: PageMeta;
  items: LootCredential[];
};

const EMPTY_FORM = {
  username: "",
  password: "",
  format: "",
  hash: "",
  host: "",
  service: ""
};

export function LootPage({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<LootCredential | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["loot", projectId, q],
    queryFn: () =>
      apiFetch<LootResponse>(
        `/api/projects/${projectId}/loot?limit=500&offset=0${q ? `&q=${encodeURIComponent(q)}` : ""}`
      ),
    enabled: !!projectId
  });

  const createLoot = useMutation({
    mutationFn: async (payload: Record<string, string>) =>
      apiFetch(`/api/projects/${projectId}/loot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }),
    onSuccess: () => {
      setShowModal(false);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["loot", projectId] });
    }
  });

  const updateLoot = useMutation({
    mutationFn: async (payload: { id: string; body: Record<string, string> }) =>
      apiFetch(`/api/loot/${payload.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload.body)
      }),
    onSuccess: () => {
      setShowModal(false);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["loot", projectId] });
    }
  });

  const deleteLoot = useMutation({
    mutationFn: async (id: string) =>
      apiFetch<void>(`/api/loot/${id}`, {
        method: "DELETE"
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loot", projectId] })
  });

  return (
    <section>
      <div className="findingsHeader">
        <h2>Loot</h2>
        <button
          onClick={() => {
            setEditing(null);
            setShowModal(true);
          }}
        >
          New Credential
        </button>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search credentials"
        style={{ minWidth: "320px" }}
      />

      {isLoading ? <p>Loading loot...</p> : null}
      {error ? <p>Failed to load loot: {(error as Error).message}</p> : null}

      <table>
        <thead>
          <tr>
            <th>Username</th>
            <th>Password</th>
            <th>Format</th>
            <th>Hash</th>
            <th>Host</th>
            <th>Service</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {(data?.items || []).map((row) => (
            <tr key={row.id}>
              <td>{row.username || ""}</td>
              <td>{row.password || ""}</td>
              <td>{row.format || ""}</td>
              <td>{row.hash || ""}</td>
              <td>{row.host || ""}</td>
              <td>{row.service || ""}</td>
              <td className="actionsCell">
                <button
                  className="iconBtn"
                  onClick={() => {
                    setEditing(row);
                    setShowModal(true);
                  }}
                  title="Edit credential"
                >
                  ✎
                </button>
                <button
                  className="iconBtn"
                  onClick={() => deleteLoot.mutate(row.id)}
                  title="Delete credential"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal ? (
        <div className="modalBackdrop">
          <div className="modalCard">
            <h3>{editing ? "Edit Credential" : "New Credential"}</h3>
            <form
              className="modalForm"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const body = {
                  username: String(fd.get("username") || ""),
                  password: String(fd.get("password") || ""),
                  format: String(fd.get("format") || ""),
                  hash: String(fd.get("hash") || ""),
                  host: String(fd.get("host") || ""),
                  service: String(fd.get("service") || "")
                };
                if (editing) {
                  updateLoot.mutate({ id: editing.id, body });
                } else {
                  createLoot.mutate(body);
                }
              }}
            >
              <label>Username</label>
              <input name="username" defaultValue={editing?.username || EMPTY_FORM.username} />
              <label>Password</label>
              <input name="password" defaultValue={editing?.password || EMPTY_FORM.password} />
              <label>Format</label>
              <input name="format" defaultValue={editing?.format || EMPTY_FORM.format} />
              <label>Hash</label>
              <input name="hash" defaultValue={editing?.hash || EMPTY_FORM.hash} />
              <label>Host</label>
              <input name="host" defaultValue={editing?.host || EMPTY_FORM.host} />
              <label>Service</label>
              <input name="service" defaultValue={editing?.service || EMPTY_FORM.service} />
              <div>
                <button type="submit">{editing ? "Save Changes" : "Create Credential"}</button>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditing(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
