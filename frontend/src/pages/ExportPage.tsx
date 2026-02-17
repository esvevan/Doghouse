import { getToken } from "../token";

export function ExportPage({ projectId }: { projectId: string }) {
  const download = async (type: string, format: string) => {
    const token = getToken();
    if (!token) {
      alert("Missing token");
      return;
    }
    const res = await fetch(`/api/projects/${projectId}/export?type=${type}&format=${format}`, {
      headers: { "X-API-Token": token }
    });
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${type}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section>
      <h2>Export</h2>
      {["assets", "services", "findings", "instances"].map((t) => (
        <p key={t}>
          {t}:{" "}
          <button onClick={() => download(t, "json")}>JSON</button>{" "}
          <button onClick={() => download(t, "csv")}>CSV</button>
        </p>
      ))}
    </section>
  );
}