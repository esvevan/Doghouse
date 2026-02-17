import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./styles.css";
import { bootstrapToken } from "./api";
import { setToken } from "./token";

const qc = new QueryClient();

async function start() {
  try {
    const token = await bootstrapToken();
    setToken(token);
  } catch (err) {
    const root = document.getElementById("root");
    if (root) root.innerHTML = "<h2>Bootstrap failed. Open via localhost and verify backend is running.</h2>";
    return;
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={qc}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>
  );
}

void start();