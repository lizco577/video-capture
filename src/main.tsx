import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { config } from "./config";
import { parseDotParam } from "./core/dot";

// ?dot=arrow,fill,smooth,zone (or all / none) picks the blue-dot variants to try.
const dot = parseDotParam(new URLSearchParams(location.search).get("dot"));
if (dot) Object.assign(config.guidance.dot, dot);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
