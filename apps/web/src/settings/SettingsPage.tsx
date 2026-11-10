import { useRouter, type ModuleViewProps } from "@cortex/core";
import { Sidebar, type SidebarSection } from "@cortex/ui";
import { authClient } from "../auth";
import { MODULES } from "../modules";
import { AccountSettings } from "./AccountSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { BackupSettings } from "./BackupSettings";
import { ConnectionsSettings } from "./ConnectionsSettings";
import { ModuleSettings } from "./ModuleSettings";
import { UserSettingsPanel } from "./UsersSettings";

function useIsAdmin(): boolean {
  const session = authClient.useSession();
  return (session.data?.user as { role?: string } | undefined)?.role === "admin";
}

/** Settings sections contributed by modules, keyed by their sub-path `/<module>/<section>`. */
const MODULE_SECTIONS = MODULES.flatMap((m) =>
  (m.settings ?? []).map((s) => ({ ...s, path: `/${m.id}/${s.id}`, moduleName: m.name })),
);

export function SettingsSidebar({ subpath }: ModuleViewProps) {
  const { navigate } = useRouter();
  const admin = useIsAdmin();
  const sections: SidebarSection[] = [
    {
      items: [
        { id: "/", label: "Appearance", icon: "sliders" },
        { id: "/modules", label: "Apps", icon: "grid" },
        { id: "/account", label: "Account", icon: "user" },
        { id: "/connections", label: "Connections", icon: "bolt" },
        { id: "/backup", label: "Backup", icon: "archive" },
        ...(admin ? [{ id: "/users", label: "Users", icon: "list" as const }] : []),
      ],
    },
  ];
  if (MODULE_SECTIONS.length) {
    sections.push({ label: "Apps", items: MODULE_SECTIONS.map((s) => ({ id: s.path, label: s.label, icon: s.icon })) });
  }
  return (
    <Sidebar
      title="Settings"
      sections={sections}
      active={subpath}
      onSelect={(id) => navigate(id === "/" ? "/settings" : `/settings${id}`)}
    />
  );
}

export function SettingsPage({ subpath }: ModuleViewProps) {
  const admin = useIsAdmin();
  const mod = MODULE_SECTIONS.find((s) => s.path === subpath);
  if (mod) return <mod.Component />;
  switch (subpath) {
    case "/modules":
      return <ModuleSettings />;
    case "/account":
      return <AccountSettings />;
    case "/connections":
      return <ConnectionsSettings />;
    case "/backup":
      return <BackupSettings />;
    case "/users":
      return admin ? <UserSettingsPanel /> : <AppearanceSettings />;
    default:
      return <AppearanceSettings />;
  }
}
