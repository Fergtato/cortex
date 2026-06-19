import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DialogProvider } from "./components/Dialog";
import { migrateStorageKeys } from "./storage/migrateKeys";
import "./styles.css";

// Move any pre-existing localStorage keys into the cortex:* namespace before
// anything reads them, so settings/data-source/sidebar state carry over.
migrateStorageKeys();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DialogProvider>
      <App />
    </DialogProvider>
  </React.StrictMode>
);
