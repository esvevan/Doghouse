import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"] as const;
const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Informational"
};

type GroupedFinding = {
  id: string;
  finding_key: string;
  title: string;
  severity: string;
  description: string | null;
  scanner: string;
  scanner_id: string | null;
  tested: boolean;
  affected_hosts: number;
};

type GroupedResponse = {
  meta: { total: number; limit: number; offset: number };
  items: GroupedFinding[];
};

function FindingDetailRow({
  findingId,
  tested,
  onToggleTested
}: {
  findingId: string;
  tested: boolean;
  onToggleTested: () => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["finding-detail", findingId],
    queryFn: () => apiFetch<any>(`/api/findings/${findingId}`),
    enabled: !!findingId
  });
  const saveFindingTested = useMutation({
    mutationFn: async (value: boolean) =>
      apiFetch(`/api/findings/${findingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tested: value })
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["findings-grouped"] });
      qc.invalidateQueries({ queryKey: ["finding-detail", findingId] });
    }
  });
  const saveInstanceNote = useMutation({
    mutationFn: async (payload: { instanceId: string; analyst_note: string }) =>
      apiFetch(`/api/instances/${payload.instanceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analyst_note: payload.analyst_note })
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finding-detail", findingId] })
  });

  if (isLoading) return <p>Loading finding detail...</p>;
  if (error) return <p>Failed to load detail: {(error as Error).message}</p>;
  if (!data) return <p>No detail.</p>;

  return (
    <div className="findingExpanded">
      <div className="findingExpandedHeader">
        <button
          className="iconBtn"
          onClick={() => {
            onToggleTested();
            saveFindingTested.mutate(!tested);
          }}
          title={tested ? "Mark untested" : "Mark tested"}
        >
          ⚑
        </button>
        <span className={tested ? "testedFinding" : ""}>{tested ? "Tested" : "Untested"}</span>
      </div>
      {data.instances.map((i: any) => (
        <div key={i.id} className="findingInstanceCard">
          <p>
            <strong>Service:</strong> {i.service_proto ? `${i.service_proto}/${i.service_port}` : "host"}
          </p>
          <p>
            <strong>Description:</strong> {data.description || "No description provided."}
          </p>
          <p>
            <strong>Vulnerable Hosts:</strong>{" "}
            <Link to={`/assets/${i.asset_id}`}>{i.asset_ip}</Link>
            {i.asset_primary_hostname ? ` (${i.asset_primary_hostname})` : ""}
          </p>
          <pre>{i.evidence_snippet || "No plugin output"}</pre>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              saveInstanceNote.mutate({
                instanceId: i.id,
                analyst_note: String(fd.get("analyst_note") || "")
              });
            }}
          >
            <textarea
              name="analyst_note"
              defaultValue={i.analyst_note || ""}
              placeholder="Finding instance note"
              style={{ width: "881px", height: "99px" }}
            />
            <button type="submit">Save finding note</button>
          </form>
        </div>
      ))}
    </div>
  );
}

export function FindingsPage({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["findings-grouped", projectId],
    queryFn: () => apiFetch<GroupedResponse>(`/api/projects/${projectId}/findings/grouped?limit=500&offset=0`),
    enabled: !!projectId
  });
  const toggleFindingTested = useMutation({
    mutationFn: async (payload: { findingId: string; tested: boolean }) =>
      apiFetch(`/api/findings/${payload.findingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tested: payload.tested })
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["findings-grouped", projectId] });
    }
  });

  const grouped: Record<string, GroupedFinding[]> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
    info: []
  };
  (data?.items || []).forEach((item) => {
    if (grouped[item.severity]) grouped[item.severity].push(item);
  });

  return (
    <section>
      <h2>Findings</h2>
      {isLoading ? <p>Loading findings...</p> : null}
      {error ? <p>Failed to load findings: {(error as Error).message}</p> : null}
      <div className="findingsBoardHeader">
        <span>Finding</span>
        <span>Affected Hosts</span>
        <span>Source</span>
      </div>
      {SEVERITY_ORDER.map((sev) => (
        <details key={sev} className="severityGroup" open>
          <summary>
            {SEVERITY_LABEL[sev]} ({grouped[sev].length})
          </summary>
          <div>
            {grouped[sev].map((finding) => (
              <details key={finding.id} className="findingRow">
                <summary className="findingSummary">
                  <span className="findingSummaryTitle">
                    <button
                      className="iconBtn"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleFindingTested.mutate({
                          findingId: finding.id,
                          tested: !finding.tested
                        });
                      }}
                      title={finding.tested ? "Mark untested" : "Mark tested"}
                    >
                      ⚑
                    </button>
                    <span className={finding.tested ? "testedFinding" : ""}>
                      {finding.title}
                    </span>
                  </span>
                  <span>{finding.affected_hosts}</span>
                  <span>{finding.scanner}</span>
                </summary>
                <FindingDetailRow
                  findingId={finding.id}
                  tested={finding.tested}
                  onToggleTested={() =>
                    toggleFindingTested.mutate({
                      findingId: finding.id,
                      tested: !finding.tested
                    })
                  }
                />
              </details>
            ))}
          </div>
        </details>
      ))}
    </section>
  );
}
