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
  kind?: "host" | "domain";
  finding_key?: string;
  title: string;
  severity: string;
  description: string | null;
  scanner: string;
  scanner_id: string | null;
  tested: boolean;
  affected_hosts: number;
  domain_id?: string;
  domain_name?: string;
};

type GroupedResponse = {
  meta?: { total: number; limit: number; offset: number };
  items: GroupedFinding[];
};

function HostFindingDetailRow({
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

  if (isLoading) return <p>Loading finding detail...</p>;
  if (error) return <p>Failed to load detail: {(error as Error).message}</p>;
  if (!data) return <p>No detail.</p>;

  const uniqueServices = Array.from(
    new Set(
      (data.instances || []).map((i: any) =>
        i.service_proto ? `${i.service_proto}/${i.service_port}` : "host"
      )
    )
  );
  const uniqueHosts = Array.from(
    new Map(
      (data.instances || []).map((i: any) => [
        i.asset_id,
        {
          asset_id: i.asset_id,
          asset_ip: i.asset_ip,
          asset_primary_hostname: i.asset_primary_hostname
        }
      ])
    ).values()
  );
  const pluginOutputs = (data.instances || [])
    .filter((i: any) => i.evidence_snippet)
    .map((i: any) => ({
      asset_id: i.asset_id,
      asset_ip: i.asset_ip,
      evidence_snippet: i.evidence_snippet
    }));

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
      <div className="findingInstanceCard">
        <p>
          <strong>Service:</strong> {uniqueServices.join(", ")}
        </p>
        <p>
          <strong>Description:</strong> {data.description || "No description provided."}
        </p>
        <p>
          <strong>Vulnerable Hosts:</strong>{" "}
          {uniqueHosts.map((host: any, index: number) => (
            <span key={host.asset_id}>
              <Link to={`/assets/${host.asset_id}`}>{host.asset_ip}</Link>
              {host.asset_primary_hostname ? ` (${host.asset_primary_hostname})` : ""}
              {index < uniqueHosts.length - 1 ? ", " : ""}
            </span>
          ))}
        </p>
        <div>
          <strong>Plugin Output:</strong>
          {pluginOutputs.length > 0 ? (
            pluginOutputs.map((output: any) => (
              <div key={`${output.asset_id}-${output.asset_ip}`}>
                <p>
                  <strong>{output.asset_ip}</strong>
                </p>
                <pre>{output.evidence_snippet}</pre>
              </div>
            ))
          ) : (
            <pre>No plugin output</pre>
          )}
        </div>
      </div>
    </div>
  );
}

function DomainFindingDetailRow({ findingId }: { findingId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["domain-finding-detail", findingId],
    queryFn: () => apiFetch<any>(`/api/domain-findings/${findingId}`),
    enabled: !!findingId
  });

  if (isLoading) return <p>Loading finding detail...</p>;
  if (error) return <p>Failed to load detail: {(error as Error).message}</p>;
  if (!data) return <p>No detail.</p>;

  return (
    <div className="findingExpanded">
      <div className="findingInstanceCard">
        <p><strong>Domain:</strong> {data.domain_name}</p>
        <p><strong>Description:</strong> {data.description || "No description provided."}</p>
        <pre>{data.finding_detail || "No detail provided."}</pre>
      </div>
    </div>
  );
}

export function FindingsPage({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const hostFindingsQuery = useQuery({
    queryKey: ["findings-grouped", projectId],
    queryFn: () => apiFetch<GroupedResponse>(`/api/projects/${projectId}/findings/grouped?limit=500&offset=0`),
    enabled: !!projectId
  });
  const domainFindingsQuery = useQuery({
    queryKey: ["domain-findings-grouped", projectId],
    queryFn: () => apiFetch<GroupedResponse>(`/api/projects/${projectId}/domain-findings/grouped`),
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

  const allItems = [...(hostFindingsQuery.data?.items || []), ...(domainFindingsQuery.data?.items || [])];
  const grouped: Record<string, GroupedFinding[]> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
    info: []
  };
  allItems.forEach((item) => {
    if (grouped[item.severity]) grouped[item.severity].push(item);
  });

  const isLoading = hostFindingsQuery.isLoading || domainFindingsQuery.isLoading;
  const error = hostFindingsQuery.error || domainFindingsQuery.error;

  return (
    <section>
      <h2>Findings</h2>
      {isLoading ? <p>Loading findings...</p> : null}
      {error ? <p>Failed to load findings: {(error as Error).message}</p> : null}
      <div className="findingsBoardHeader">
        <span />
        <span>Affected Hosts</span>
        <span>Source</span>
      </div>
      {SEVERITY_ORDER.map((sev) => (
        <details key={sev} className="severityGroup">
          <summary>
            {SEVERITY_LABEL[sev]} ({grouped[sev].length})
          </summary>
          <div>
            {grouped[sev].map((finding) => (
              <details key={`${finding.kind || "host"}-${finding.id}`} className="findingRow">
                <summary className="findingSummary">
                  <span className="findingSummaryTitle">
                    {finding.kind === "domain" ? null : (
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
                    )}
                    <span className={finding.tested ? "testedFinding" : ""}>
                      {finding.title}
                      {finding.kind === "domain" && finding.domain_name ? ` (${finding.domain_name})` : ""}
                    </span>
                  </span>
                  <span>{finding.kind === "domain" ? "-" : finding.affected_hosts}</span>
                  <span>{finding.scanner}</span>
                </summary>
                {finding.kind === "domain" ? (
                  <DomainFindingDetailRow findingId={finding.id} />
                ) : (
                  <HostFindingDetailRow
                    findingId={finding.id}
                    tested={finding.tested}
                    onToggleTested={() =>
                      toggleFindingTested.mutate({
                        findingId: finding.id,
                        tested: !finding.tested
                      })
                    }
                  />
                )}
              </details>
            ))}
          </div>
        </details>
      ))}
    </section>
  );
}
