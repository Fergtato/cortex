import { useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type InstanceInfo } from "@cortex/core";
import { Button, Input, LogoMark, Panel } from "@cortex/ui";
import { authClient } from "./auth";

/**
 * Mounts the app only once there is a session. Before that it shows one of:
 * first-run setup (no users yet: this account becomes the admin), sign-in,
 * or sign-up (hosted mode only, `ALLOW_SIGNUP=true`).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  const instance = useQuery({ queryKey: ["instance"], queryFn: () => api<InstanceInfo>("/instance") });

  if (session.isPending || instance.isPending) return <div className="auth-screen" />;
  if (instance.isError) {
    return (
      <AuthFrame title="Can't reach the server" subtitle={String(instance.error)}>
        <Button variant="secondary" onClick={() => instance.refetch()}>
          Try again
        </Button>
      </AuthFrame>
    );
  }
  if (session.data) return <>{children}</>;
  return <SignedOut info={instance.data} />;
}

function AuthFrame({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="auth-screen">
      <Panel className="auth-card">
        <div className="auth-brand">
          <span className="cx-rail__mark"><LogoMark /></span>
          <span className="cx-label">Cortex</span>
        </div>
        <div className="cx-page-head">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {children}
      </Panel>
    </div>
  );
}

function SignedOut({ info }: { info: InstanceInfo }) {
  const qc = useQueryClient();
  const canSignUp = info.needsSetup || info.allowSignup;
  const [mode, setMode] = useState<"in" | "up">(info.needsSetup ? "up" : "in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res =
      mode === "up"
        ? await authClient.signUp.email({ name: name || email.split("@")[0], email, password })
        : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (res.error) setError(res.error.message ?? "Something went wrong");
    else void qc.invalidateQueries({ queryKey: ["instance"] });
  };

  const setup = info.needsSetup;
  return (
    <AuthFrame
      title={setup ? "Set up Cortex" : mode === "up" ? "Create account" : "Sign in"}
      subtitle={setup ? "No accounts yet. This one becomes the admin." : undefined}
    >
      <form className="auth-form" onSubmit={submit}>
        {mode === "up" && (
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        )}
        <Input
          label="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoFocus
        />
        <Input
          label="Password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "up" ? "new-password" : "current-password"}
          hint={mode === "up" ? "At least 8 characters" : undefined}
          invalid={!!error}
        />
        {error && <p className="auth-error">{error}</p>}
        <Button type="submit" variant="primary" disabled={busy}>
          {setup ? "Create admin account" : mode === "up" ? "Create account" : "Sign in"}
        </Button>
        {canSignUp && !setup && (
          <Button variant="ghost" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? "Create an account" : "I already have an account"}
          </Button>
        )}
        {!canSignUp && mode === "in" && <p className="auth-note">No account? Ask the person who runs this Cortex.</p>}
      </form>
    </AuthFrame>
  );
}
