import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiFetch } from "../api";

type SummaryRow = {
  port: number;
  proto: string;
  service: string;
  product: string;
  host_count: number;
};

type SummaryResponse = {
  meta: { total: number; limit: number; offset: number };
  items: SummaryRow[];
  hosts: string[];
};

type SortField = "port" | "proto" | "service" | "product";

function downloadHosts(hosts: string[], format: "txt" | "csv") {
  const content =
    format === "txt"
      ? hosts.join("\n")
      : ["ip", ...hosts].join("\n");
  const blob = new Blob([content], { type: format === "txt" ? "text/plain" : "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hosts.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ServicesPage({ projectId }: { projectId: string }) {
  const [port, setPort] = useState("");
  const [proto, setProto] = useState("");
  const [service, setService] = useState("");
  const [product, setProduct] = useState("");
  const [sort, setSort] = useState<SortField>("port");
  const [order, setOrder] = useState<"asc" | "desc">("asc");

  const query = useMemo(() => {
    const q = new URLSearchParams({
      limit: "500",
      offset: "0",
      sort,
      order
    });
    if (port) q.set("port", port);
    if (proto) q.set("proto", proto);
    if (service) q.set("service", service);
    if (product) q.set("product", product);
    return q.toString();
  }, [port, proto, service, product, sort, order]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["service-summary", projectId, query],
    queryFn: () => apiFetch<SummaryResponse>(`/api/projects/${projectId}/services/summary?${query}`),
    enabled: !!projectId
  });

  const onSort = (field: SortField) => {
    if (sort === field) {
      setOrder(order === "asc" ? "desc" : "asc");
    } else {
      setSort(field);
      setOrder("asc");
    }
  };

  return (
    <section>
      <h2>Services</h2>
      {isLoading ? <p>Loading services...</p> : null}
      {error ? <p>Failed to load services: {(error as Error).message}</p> : null}
      <div className="servicesLayout">
        <div>
          <table>
            <thead>
              <tr>
                <th>
                  <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="Port" />
                  <button className="iconBtn" onClick={() => onSort("port")} title="Sort Port">
                    {sort === "port" ? (order === "asc" ? "▲" : "▼") : "↕"}
                  </button>
                </th>
                <th>
                  <input value={proto} onChange={(e) => setProto(e.target.value)} placeholder="Protocol" />
                  <button className="iconBtn" onClick={() => onSort("proto")} title="Sort Protocol">
                    {sort === "proto" ? (order === "asc" ? "▲" : "▼") : "↕"}
                  </button>
                </th>
                <th>
                  <input value={service} onChange={(e) => setService(e.target.value)} placeholder="Service" />
                  <button className="iconBtn" onClick={() => onSort("service")} title="Sort Service">
                    {sort === "service" ? (order === "asc" ? "▲" : "▼") : "↕"}
                  </button>
                </th>
                <th>
                  <input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Product" />
                  <button className="iconBtn" onClick={() => onSort("product")} title="Sort Product">
                    {sort === "product" ? (order === "asc" ? "▲" : "▼") : "↕"}
                  </button>
                </th>
                <th>Hosts</th>
              </tr>
              <tr>
                <th onClick={() => onSort("port")} style={{ cursor: "pointer" }}>Port</th>
                <th onClick={() => onSort("proto")} style={{ cursor: "pointer" }}>Protocol</th>
                <th onClick={() => onSort("service")} style={{ cursor: "pointer" }}>Service</th>
                <th onClick={() => onSort("product")} style={{ cursor: "pointer" }}>Product</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items || []).map((r, idx) => (
                <tr key={`${r.port}-${r.proto}-${r.service}-${r.product}-${idx}`}>
                  <td>{r.port}</td>
                  <td>{r.proto}</td>
                  <td>{r.service || "-"}</td>
                  <td>{r.product || "-"}</td>
                  <td>{r.host_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <aside className="hostListPane">
          <h3>Hosts</h3>
          <p>Matching hosts: {data?.hosts.length || 0}</p>
          <div>
            <button onClick={() => downloadHosts(data?.hosts || [], "txt")}>Download TXT</button>
            <button onClick={() => downloadHosts(data?.hosts || [], "csv")}>Download CSV</button>
          </div>
          <ul>
            {(data?.hosts || []).map((ip) => (
              <li key={ip}>{ip}</li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
