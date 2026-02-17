import { Link, Outlet } from "react-router-dom";

export function Layout() {
  return (
    <div className="app">
      <header className="topbar">
        <h1>Doghouse</h1>
        <nav>
          <Link to="/">Projects</Link>
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/assets">Assets</Link>
          <Link to="/findings">Findings</Link>
          <Link to="/notes">Notes</Link>
          <Link to="/export">Export</Link>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}