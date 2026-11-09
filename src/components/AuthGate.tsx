import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseMode, setDataSource, getDataSource } from "../storage/datasource";
import { getSupabase } from "../lib/supabase";
import { applySavedSettings } from "../settings";
import { Logo } from "./Logo";

/**
 * Account gate for the Supabase data source. Accounts are invite-only: public
 * sign-up is disabled on the Supabase server and users are created/invited
 * from Studio, so this only offers sign-in, password reset, and setting a
 * password after following an invite or reset link. The app (and therefore
 * the store + its adapter) only mounts once a session exists.
 *
 * In localStorage mode there are no accounts and the app renders directly.
 */

interface AuthInfo {
  email: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthInfo | null>(null);

/** Signed-in account info, or null in localStorage mode. */
export function useAuth(): AuthInfo | null {
  return useContext(AuthContext);
}

// Captured at module load, before supabase-js consumes the URL hash: an invite
// link lands as `#access_token=…&type=invite`, a reset link as `type=recovery`.
const landingType = new URLSearchParams(window.location.hash.slice(1)).get("type");

export function AuthGate({ children }: { children: ReactNode }) {
  if (!isSupabaseMode()) return <>{children}</>;
  return <SupabaseGate>{children}</SupabaseGate>;
}

function SupabaseGate({ children }: { children: ReactNode }) {
  // undefined = still restoring the session from storage / URL.
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [needsPassword, setNeedsPassword] = useState(
    landingType === "invite" || landingType === "recovery"
  );

  useEffect(() => {
    applySavedSettings();
    const sb = getSupabase();
    let active = true;
    sb.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
    });
    const { data: sub } = sb.auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY") setNeedsPassword(true);
      // Ignore token refreshes for identity purposes: same user, same app.
      setSession(next);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await getSupabase().auth.signOut();
    window.location.reload();
  };

  if (session === undefined) {
    return (
      <AuthShell title="connecting">
        <p className="auth-note">…restoring session</p>
      </AuthShell>
    );
  }
  if (session && needsPassword) {
    return (
      <SetPasswordScreen
        email={session.user.email ?? ""}
        invited={landingType === "invite"}
        onDone={() => setNeedsPassword(false)}
      />
    );
  }
  if (!session) return <LoginScreen />;

  return (
    <AuthContext.Provider value={{ email: session.user.email ?? null, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="auth-screen">
      <div className="auth-box">
        <div className="dialog-bar auth-bar">
          <Logo />
          <span>{title}</span>
        </div>
        <div className="auth-body">{children}</div>
      </div>
    </div>
  );
}

function LoginScreen() {
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const sb = getSupabase();
    try {
      if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) setError(error.message);
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin,
        });
        if (error) setError(error.message);
        else setNotice("if that account exists, a reset link is on its way");
      }
    } catch (err) {
      setError(`can't reach the server: ${String((err as Error)?.message ?? err)}`);
    } finally {
      setBusy(false);
    }
  }

  function switchToLocal() {
    setDataSource({ ...getDataSource(), mode: "local" });
    window.location.reload();
  }

  return (
    <AuthShell title={mode === "signin" ? "sign in" : "reset password"}>
      <form onSubmit={submit} className="auth-form">
        <label className="ds-field">
          <span className="ds-field-label">email</span>
          <input
            className="dialog-input"
            type="email"
            autoComplete="username"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {mode === "signin" && (
          <label className="ds-field">
            <span className="ds-field-label">password</span>
            <input
              className="dialog-input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        {error && <p className="auth-error">✗ {error}</p>}
        {notice && <p className="auth-notice">✓ {notice}</p>}
        <div className="auth-actions">
          <button
            type="button"
            className="auth-link"
            onClick={() => {
              setMode(mode === "signin" ? "forgot" : "signin");
              setError(null);
              setNotice(null);
            }}
          >
            {mode === "signin" ? "forgot password?" : "← back to sign in"}
          </button>
          <button type="submit" className="dialog-btn primary" disabled={busy}>
            {busy ? "[ … ]" : mode === "signin" ? "[ sign in ]" : "[ send link ]"}
          </button>
        </div>
      </form>
      <p className="auth-note">
        accounts are invite-only.{" "}
        <button type="button" className="auth-link" onClick={switchToLocal}>
          use this browser's local storage instead
        </button>
      </p>
    </AuthShell>
  );
}

function SetPasswordScreen({
  email,
  invited,
  onDone,
}: {
  email: string;
  invited: boolean;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("use at least 8 characters");
    if (password !== confirm) return setError("passwords don't match");
    setBusy(true);
    setError(null);
    const { error } = await getSupabase().auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    // Drop the auth fragment so a reload doesn't re-trigger this screen.
    history.replaceState(null, "", window.location.pathname + window.location.search);
    onDone();
  }

  return (
    <AuthShell title={invited ? "welcome — choose a password" : "set a new password"}>
      <form onSubmit={submit} className="auth-form">
        <p className="auth-note">{email}</p>
        <label className="ds-field">
          <span className="ds-field-label">new password</span>
          <input
            className="dialog-input"
            type="password"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="ds-field">
          <span className="ds-field-label">confirm</span>
          <input
            className="dialog-input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        {error && <p className="auth-error">✗ {error}</p>}
        <div className="auth-actions">
          <span />
          <button type="submit" className="dialog-btn primary" disabled={busy}>
            {busy ? "[ … ]" : "[ save password ]"}
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
