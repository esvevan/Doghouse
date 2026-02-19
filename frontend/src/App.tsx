import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useState } from "react";
import { Layout } from "./components/Layout";
import { ProjectsPage } from "./pages/ProjectsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AssetsPage } from "./pages/AssetsPage";
import { ServicesPage } from "./pages/ServicesPage";
import { AssetDetailPage } from "./pages/AssetDetailPage";
import { FindingsPage } from "./pages/FindingsPage";
import { FindingDetailPage } from "./pages/FindingDetailPage";
import { NotesPage } from "./pages/NotesPage";
import { ExportPage } from "./pages/ExportPage";

export default function App() {
  const [projectId, setProjectId] = useState<string>("");

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<ProjectsPage onSelect={setProjectId} />} />
          <Route path="dashboard" element={projectId ? <DashboardPage projectId={projectId} /> : <Navigate to="/" />} />
          <Route path="assets" element={projectId ? <AssetsPage projectId={projectId} /> : <Navigate to="/" />} />
          <Route path="services" element={projectId ? <ServicesPage projectId={projectId} /> : <Navigate to="/" />} />
          <Route path="assets/:assetId" element={<AssetDetailPage />} />
          <Route path="findings" element={projectId ? <FindingsPage projectId={projectId} /> : <Navigate to="/" />} />
          <Route path="findings/:findingId" element={<FindingDetailPage />} />
          <Route path="notes" element={projectId ? <NotesPage projectId={projectId} /> : <Navigate to="/" />} />
          <Route path="export" element={projectId ? <ExportPage projectId={projectId} /> : <Navigate to="/" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
