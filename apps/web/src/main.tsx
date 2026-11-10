import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DialogProvider, RouterProvider } from "@cortex/core";
import "@cortex/ui/styles.css";
import "./app.css";
import { AuthGate } from "./AuthGate";
import { Shell } from "./Shell";
import { ThemeApplier } from "./ThemeApplier";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider>
        <DialogProvider>
          <AuthGate>
            <ThemeApplier />
            <Shell />
          </AuthGate>
        </DialogProvider>
      </RouterProvider>
    </QueryClientProvider>
  </StrictMode>,
);
