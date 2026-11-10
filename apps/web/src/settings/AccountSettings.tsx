import { useState } from "react";
import { PageFrame } from "@cortex/core";
import { Button, Grid, Input, Panel } from "@cortex/ui";
import { authClient } from "../auth";

export function AccountSettings() {
  const session = authClient.useSession();
  const user = session.data?.user;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const changePassword = async () => {
    const r = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
    if (r.error) setMsg({ ok: false, text: r.error.message ?? "Could not change password" });
    else {
      setMsg({ ok: true, text: "Password changed. Other sessions were signed out." });
      setCurrent("");
      setNext("");
    }
  };

  return (
    <PageFrame
      crumbs={["Settings", "Account"]}
      title="Account"
      actions={
        <Button variant="secondary" onClick={() => authClient.signOut().then(() => window.location.assign("/"))}>
          Sign out
        </Button>
      }
    >
      <Grid>
        <Panel span={6} label="Profile">
          <dl className="settings-dl">
            <dt>Name</dt>
            <dd>{user?.name}</dd>
            <dt>Email</dt>
            <dd>{user?.email}</dd>
            <dt>Role</dt>
            <dd>{(user as { role?: string } | undefined)?.role ?? "user"}</dd>
          </dl>
        </Panel>
        <Panel span={6} label="Change password">
          <div className="settings-stack">
            <Input label="Current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            <Input label="New" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" hint="At least 8 characters" />
            {msg && <p className={msg.ok ? "settings-ok" : "settings-error"}>{msg.text}</p>}
            <div>
              <Button variant="primary" disabled={!current || next.length < 8} onClick={changePassword}>
                Change password
              </Button>
            </div>
          </div>
        </Panel>
      </Grid>
    </PageFrame>
  );
}
