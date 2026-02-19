import { Link, Outlet } from "react-router-dom";

export function Layout() {
  return (
    <div className="appShell">
      <aside className="sidebar">
        <h1>Doghouse</h1>
        <nav className="sideNav">
          <Link to="/">Projects</Link>
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/assets">Hosts</Link>
          <Link to="/services">Services</Link>
          <Link to="/findings">Findings</Link>
          <Link to="/notes">Notes</Link>
          <Link to="/export">Export</Link>
        </nav>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
