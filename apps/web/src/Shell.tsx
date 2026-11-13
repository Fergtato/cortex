import { useEffect, useRef, useState } from "react";
import { splitPath, useRouter, useSettings } from "@cortex/core";
import { AppRail, Button, type RailApp } from "@cortex/ui";
import { HOME_ID, MODULES } from "./modules";
import { SettingsPage, SettingsSidebar } from "./settings/SettingsPage";

const SETTINGS_ID = "settings";
const LAST_KEY = "cortex.lastPaths";

function readLast(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(LAST_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

/**
 * The frame every module renders inside: app rail, the active module's
 * sidebar, and its page. `/` is Home; `/<module>/…` is that module;
 * `/settings/…` is the built-in settings app.
 */
export function Shell() {
  const { path, search, navigate } = useRouter();
  const { settings } = useSettings();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const enabled = MODULES.filter((m) => !m.hidden && (m.id === HOME_ID || !settings.disabledModules.includes(m.id)));
  const { moduleId, subpath } = splitPath(path);
  const activeId = moduleId === "" ? HOME_ID : moduleId;
  const mod = enabled.find((m) => m.id === activeId);

  // Close the narrow-screen sidebar overlay whenever the route changes.
  useEffect(() => setSidebarOpen(false), [path]);

  // Each app remembers where you were, so switching apps and back returns there.
  const last = useRef<Record<string, string>>(readLast());
  useEffect(() => {
    last.current[activeId] = path + search;
    try {
      sessionStorage.setItem(LAST_KEY, JSON.stringify(last.current));
    } catch {
      /* storage unavailable: memory still works for this tab */
    }
  }, [activeId, path, search]);
  const openApp = (id: string) => {
    const root = id === HOME_ID ? "/" : `/${id}`;
    // Clicking the app you're in goes to its start; another app resumes where you left it.
    navigate(id === activeId ? root : (last.current[id] ?? root));
  };

  const apps: RailApp[] = [
    ...enabled.map((m) => ({ id: m.id, label: m.name, icon: m.icon })),
    { id: SETTINGS_ID, label: "Settings", icon: "sliders", bottom: true },
  ];

  const isSettings = activeId === SETTINGS_ID;
  const Sidebar = isSettings ? SettingsSidebar : mod?.Sidebar;

  return (
    <div className="cx-shell" data-sidebar-open={sidebarOpen}>
      <AppRail apps={apps} active={activeId} onSelect={openApp} />
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
