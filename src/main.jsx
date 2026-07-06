import React from "react";
import { createRoot } from "react-dom/client";
import SalesTracker from "./SalesTracker.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SalesTracker />
  </React.StrictMode>
);
