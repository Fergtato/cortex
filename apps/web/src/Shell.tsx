import { useEffect, useState } from "react";
import { splitPath, useRouter, useSettings } from "@cortex/core";
import { AppRail, Button, type RailApp } from "@cortex/ui";
import { HOME_ID, MODULES } from "./modules";
import { SettingsPage, SettingsSidebar } from "./settings/SettingsPage";

const SETTINGS_ID = "settings";

/**
 * The frame every module renders inside: app rail, the active module's
 * sidebar, and its page. `/` is Home; `/<module>/…` is that module;
 * `/settings/…` is the built-in settings app.
 */
export function Shell() {
  const { path, navigate } = useRouter();
  const { settings } = useSettings();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const enabled = MODULES.filter((m) => !m.hidden && (m.id === HOME_ID || !settings.disabledModules.includes(m.id)));
  const { moduleId, subpath } = splitPath(path);
  const activeId = moduleId === "" ? HOME_ID : moduleId;
  const mod = enabled.find((m) => m.id === activeId);

  // Close the narrow-screen sidebar overlay whenever the route changes.
  useEffect(() => setSidebarOpen(false), [path]);

  const apps: RailApp[] = [
    ...enabled.map((m) => ({ id: m.id, label: m.name, icon: m.icon })),
    { id: SETTINGS_ID, label: "Settings", icon: "sliders", bottom: true },
  ];

  const isSettings = activeId === SETTINGS_ID;
  const Sidebar = isSettings ? SettingsSidebar : mod?.Sidebar;

  return (
    <div className="cx-shell" data-sidebar-open={sidebarOpen}>
      <AppRail apps={apps} active={activeId} onSelect={(id) => navigate(id === HOME_ID ? "/" : `/${id}`)} />
      {Sidebar && <Sidebar subpath={subpath} />}
      <main className="cx-main">
        {Sidebar && (
          <Button
            className="shell-sidebar-toggle"
            variant="ghost"
            size="sm"
            icon="sidebar"
            aria-label="Toggle sidebar"
            onClick={() => setSidebarOpen((o) => !o)}
          />
        )}
        {isSettings ? (
          <SettingsPage subpath={subpath} />
        ) : mod ? (
          <mod.Page subpath={subpath} />
        ) : (
          <NotFound onHome={() => navigate("/")} />
        )}
      </main>
    </div>
  );
}

function NotFound({ onHome }: { onHome: () => void }) {
  return (
    <div className="cx-canvas shell-empty">
      <p className="cx-label">Not found</p>
      <p>There is no app at this address, or it is switched off in Settings.</p>
      <Button variant="secondary" onClick={onHome}>
        Go home
      </Button>
    </div>
  );
}
