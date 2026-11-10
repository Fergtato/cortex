import { useRouter, type ModuleViewProps } from "@cortex/core";
import { Sidebar } from "@cortex/ui";
import { authClient } from "../auth";
import { AccountSettings } from "./AccountSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { ModuleSettings } from "./ModuleSettings";
import { UserSettingsPanel } from "./UsersSettings";

const SECTIONS = [
  { id: "/", label: "Appearance", icon: "sliders" },
  { id: "/modules", label: "Apps", icon: "grid" },
  { id: "/account", label: "Account", icon: "user" },
] as const;

function useIsAdmin(): boolean {
  const session = authClient.useSession();
  return (session.data?.user as { role?: string } | undefined)?.role === "admin";
}

export function SettingsSidebar({ subpath }: ModuleViewProps) {
  const { navigate } = useRouter();
  const admin = useIsAdmin();
  const items = [...SECTIONS.map((s) => ({ ...s })), ...(admin ? [{ id: "/users", label: "Users", icon: "list" as const }] : [])];
  return (
    <Sidebar
      title="Settings"
      sections={[{ items }]}
      active={subpath}
      onSelect={(id) => navigate(id === "/" ? "/settings" : `/settings${id}`)}
    />
  );
}

export function SettingsPage({ subpath }: ModuleViewProps) {
  const admin = useIsAdmin();
  switch (subpath) {
    case "/modules":
      return <ModuleSettings />;
    case "/account":
      return <AccountSettings />;
    case "/users":
      return admin ? <UserSettingsPanel /> : <AppearanceSettings />;
    default:
      return <AppearanceSettings />;
  }
}
