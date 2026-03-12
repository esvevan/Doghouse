import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getToken } from "../token";
import { apiFetch } from "../api";
import { Domain, DomainFinding, DomainUserList } from "../types";

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Informational"
};

const SEVERITY_ORDER: Record<string, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1
};

type DomainDetail = {
  domain: Domain;
  findings: DomainFinding[];
  user_lists: DomainUserList[];
};

export function DomainPage({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [selectedDomainId, setSelectedDomainId] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [userListMessage, setUserListMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const { data: domains = [] } = useQuery({
    queryKey: ["domains", projectId],
    queryFn: () => apiFetch<Domain[]>(`/api/projects/${projectId}/domains`),
    enabled: !!projectId
  });

  const detailQuery = useQuery({
    queryKey: ["domain-detail", selectedDomainId],
    queryFn: () => apiFetch<DomainDetail>(`/api/domains/${selectedDomainId}`),
    enabled: !!selectedDomainId
  });

  const createDomain = useMutation({
    mutationFn: async (name: string) =>
      apiFetch<Domain>(`/api/projects/${projectId}/domains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      }),
    onSuccess: (domain) => {
      setSelectedDomainId(domain.id);
      qc.invalidateQueries({ queryKey: ["domains", projectId] });
    }
  });

  const saveDomainNote = useMutation({
    mutationFn: async (payload: { domainId: string; note: string }) =>
      apiFetch<Domain>(`/api/domains/${payload.domainId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: payload.note })
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["domain-detail", selectedDomainId] })
  });

  const addDomainFinding = useMutation({
    mutationFn: async (payload: { title: string; severity: string; description: string; finding_detail: string }) =>
      apiFetch<DomainFinding>(`/api/domains/${selectedDomainId}/findings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }),
    onSuccess: () => {
      setShowModal(false);
      qc.invalidateQueries({ queryKey: ["domain-detail", selectedDomainId] });
    }
  });

  const uploadUserList = useMutation({
    mutationFn: async (file: File) => {
      const token = getToken();
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/domains/${selectedDomainId}/user-lists`, {
        method: "POST",
        headers: { "X-API-Token": token || "" },
        body: fd
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      setUserListMessage({ kind: "success", text: "Upload was successful" });
      qc.invalidateQueries({ queryKey: ["domain-detail", selectedDomainId] });
    },
    onError: (error) => {
      setUserListMessage({ kind: "error", text: (error as Error).message || "Upload failed" });
    }
  });

  const detail = detailQuery.data;
  const grouped = useMemo(() => {
    const buckets: Record<string, DomainFinding[]> = { critical: [], high: [], medium: [], low: [], info: [] };
    (detail?.findings || [])
      .slice()
      .sort((a, b) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0))
      .forEach((finding) => buckets[finding.severity]?.push(finding));
    return buckets;
  }, [detail]);

  return (
    <section>
      <div className="findingsHeader">
        <h2>Domain</h2>
      </div>

      <div className="domainPickerRow">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const name = String(fd.get("name") || "").trim();
            if (!name) return;
            createDomain.mutate(name);
            e.currentTarget.reset();
          }}
        >
          <input name="name" placeholder="Add domain name" required />
          <button type="submit">Add domain</button>
        </form>
        <select
          value={selectedDomainId}
          onChange={(e) => setSelectedDomainId(e.target.value)}
        >
          <option value="">Select domain</option>
          {domains.map((domain) => (
            <option key={domain.id} value={domain.id}>
              {domain.name}
            </option>
          ))}
        </select>
      </div>

      {!selectedDomainId ? <p>Select or create a domain to start documenting domain-level information.</p> : null}

      {detail ? (
        <>
          <div className="hostTopGrid">
            <div className="hostTopLeft">
              <h2>Domain Detail: {detail.domain.name}</h2>
              <h3>Domain Note</h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  saveDomainNote.mutate({
                    domainId: detail.domain.id,
                    note: String(fd.get("note") || "")
                  });
                }}
              >
                <textarea
                  name="note"
                  defaultValue={detail.domain.note || ""}
                  placeholder="Add note to this domain"
                  style={{ width: "1258px", height: "207px" }}
                />
                <button type="submit">Save note</button>
              </form>
            </div>
          </div>

          <div className="toolOutputSection">
            <div className="findingsHeader">
              <h3>User Lists</h3>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const input = e.currentTarget.elements.namedItem("file") as HTMLInputElement | null;
                if (!input?.files?.length) return;
                setUserListMessage(null);
                uploadUserList.mutate(input.files[0]);
                input.value = "";
              }}
            >
              <input type="file" name="file" accept=".txt,.csv,.json" />
              <button type="submit" disabled={uploadUserList.isPending}>Upload users list</button>
            </form>
            {userListMessage ? (
              <p className={userListMessage.kind === "success" ? "statusSuccess" : "statusError"}>
                {userListMessage.text}
              </p>
            ) : null}
            {(detail.user_lists || []).length === 0 ? <p>No users lists uploaded.</p> : null}
            {(detail.user_lists || []).map((entry) => (
              <details key={entry.id} className="toolOutputCard">
                <summary>{entry.original_filename}</summary>
                <pre>{entry.preview_text || "No preview available."}</pre>
              </details>
            ))}
          </div>

          <div className="findingsHeader">
            <h3>Domain Findings</h3>
            <button onClick={() => setShowModal(true)}>Add finding to domain</button>
          </div>

          {(["critical", "high", "medium", "low", "info"] as const).map((sev) => (
            <details key={sev} className="severityGroup">
              <summary>{SEVERITY_LABEL[sev]} ({grouped[sev].length})</summary>
              <ul>
                {grouped[sev].map((finding) => (
                  <li key={finding.id}>
                    <details>
                      <summary><strong>{SEVERITY_LABEL[finding.severity]} {finding.title}</strong></summary>
                      <p>Description: {finding.description || "No description provided."}</p>
                      <pre>{finding.finding_detail || "No detail provided."}</pre>
                    </details>
                  </li>
                ))}
              </ul>
            </details>
          ))}

          {showModal ? (
            <div className="modalBackdrop">
              <div className="modalCard">
                <h3>Add finding to domain</h3>
                <form
                  className="modalForm"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    addDomainFinding.mutate({
                      title: String(fd.get("title") || ""),
                      severity: String(fd.get("severity") || "info"),
                      description: String(fd.get("description") || ""),
                      finding_detail: String(fd.get("finding_detail") || "")
                    });
                  }}
                >
                  <label>Finding Title</label>
                  <input name="title" required />
                  <label>Criticality</label>
                  <select name="severity" defaultValue="info">
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                    <option value="info">Informational</option>
                  </select>
                  <label>Description</label>
                  <textarea name="description" required />
                  <label>Finding Detail</label>
                  <textarea name="finding_detail" required />
                  <div>
                    <button type="submit">Add Finding</button>
                    <button type="button" onClick={() => setShowModal(false)}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
