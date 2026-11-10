import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageFrame, useDialog } from "@cortex/core";
import { Badge, Button, Grid, Input, Panel, Segmented } from "@cortex/ui";
import { authClient } from "../auth";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  createdAt: string | Date;
}

/** Admin only: invite-style account creation (public sign-up is closed on self-host). */
export function UserSettingsPanel() {
  const qc = useQueryClient();
  const dialog = useDialog();
  const me = authClient.useSession().data?.user.id;
  const users = useQuery({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const r = await authClient.admin.listUsers({ query: { limit: 200, sortBy: "createdAt" } });
      if (r.error) throw new Error(r.error.message);
      return r.data.users as AdminUser[];
    },
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const r = await authClient.admin.createUser({ name: name || email.split("@")[0], email, password, role });
      if (r.error) throw new Error(r.error.message);
    },
    onSuccess: () => {
      setName("");
      setEmail("");
      setPassword("");
      setError(null);
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e) => setError(e.message),
  });

  const remove = async (u: AdminUser) => {
    const ok = await dialog.confirm(`Delete ${u.email}? Their account is removed and they are signed out.`, {
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    const r = await authClient.admin.removeUser({ userId: u.id });
    if (r.error) setError(r.error.message ?? "Could not delete user");
    void qc.invalidateQueries({ queryKey: ["admin", "users"] });
  };

  return (
    <PageFrame crumbs={["Settings", "Users"]} title="Users" subtitle="Sign-up is closed. Create accounts here and share the password with the person.">
      <Grid>
        <Panel span={8} label="Accounts" meta={users.data ? `${users.data.length}` : undefined} flush>
          <ul className="settings-list">
            {users.data?.map((u) => (
              <li key={u.id}>
                <span className="settings-list__label">
                  {u.name} <span className="settings-muted">{u.email}</span>
                </span>
                {u.role === "admin" && <Badge tone="accent">Admin</Badge>}
                {u.id === me ? (
                  <Badge>You</Badge>
                ) : (
                  <Button size="sm" variant="ghost" icon="x" aria-label={`Delete ${u.email}`} onClick={() => remove(u)} />
                )}
              </li>
            ))}
            {users.isError && <li className="settings-error">{String(users.error)}</li>}
          </ul>
        </Panel>
        <Panel span={4} label="Add person">
          <form
            className="settings-stack"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label="Password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} hint="They can change it in Settings, Account" />
            <Segmented size="sm" aria-label="Role" options={["user", "admin"]} value={role} onChange={(v) => setRole(v as "user" | "admin")} />
            {error && <p className="settings-error">{error}</p>}
            <div>
              <Button type="submit" variant="primary" disabled={create.isPending}>
                Create account
              </Button>
            </div>
          </form>
        </Panel>
      </Grid>
    </PageFrame>
  );
}
