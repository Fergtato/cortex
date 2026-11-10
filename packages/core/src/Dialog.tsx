import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@cortex/ui";

/*
 * In-app replacement for window.confirm / prompt. Native dialogs are
 * forbidden: they freeze the page and are silently disabled in some browsers.
 */

interface ConfirmOptions {
  confirmLabel?: string;
  danger?: boolean;
}

export interface ChoiceOption {
  label: string;
  value: string;
}

type DialogRequest =
  | { kind: "confirm"; message: string; confirmLabel: string; danger: boolean; resolve: (ok: boolean) => void }
  | { kind: "prompt"; message: string; defaultValue: string; resolve: (value: string | null) => void }
  | { kind: "choose"; message: string; options: ChoiceOption[]; resolve: (value: string | null) => void };

export interface DialogApi {
  confirm: (message: string, opts?: ConfirmOptions) => Promise<boolean>;
  prompt: (message: string, defaultValue?: string) => Promise<string | null>;
  choose: (message: string, options: ChoiceOption[]) => Promise<string | null>;
}

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used within <DialogProvider>");
  return ctx;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);

  const confirm = useCallback(
    (message: string, opts?: ConfirmOptions) =>
      new Promise<boolean>((resolve) =>
        setRequest({
          kind: "confirm",
          message,
          confirmLabel: opts?.confirmLabel ?? "OK",
          danger: opts?.danger ?? false,
          resolve,
        }),
      ),
    [],
  );
  const prompt = useCallback(
    (message: string, defaultValue = "") =>
      new Promise<string | null>((resolve) => setRequest({ kind: "prompt", message, defaultValue, resolve })),
    [],
  );
  const choose = useCallback(
    (message: string, options: ChoiceOption[]) =>
      new Promise<string | null>((resolve) => setRequest({ kind: "choose", message, options, resolve })),
    [],
  );

  const close = useCallback(
    (result: boolean | string | null) => {
      if (!request) return;
      request.resolve(result as never);
      setRequest(null);
    },
    [request],
  );

  return (
    <DialogContext.Provider value={{ confirm, prompt, choose }}>
      {children}
      {request && <DialogModal request={request} onClose={close} />}
    </DialogContext.Provider>
  );
}

function DialogModal({ request, onClose }: { request: DialogRequest; onClose: (r: boolean | string | null) => void }) {
  const [value, setValue] = useState(request.kind === "prompt" ? request.defaultValue : "");
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (request.kind === "prompt") {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      boxRef.current?.querySelector<HTMLButtonElement>("[data-primary]")?.focus();
    }
  }, [request]);

  const accept = () => onClose(request.kind === "prompt" ? value : true);
  const cancel = () => onClose(request.kind === "confirm" ? false : null);
  const danger = request.kind === "confirm" && request.danger;

  return (
    <div className="cx-dialog-scrim" onMouseDown={cancel}>
      <div
        ref={boxRef}
        className="cx-dialog"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
          if (e.key === "Enter" && request.kind === "confirm") accept();
        }}
      >
        <p className="cx-dialog__message">{request.message}</p>
        {request.kind === "prompt" && (
          <span className="cx-input">
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && accept()}
            />
          </span>
        )}
        {request.kind === "choose" && (
          <div className="cx-dialog__choices">
            {request.options.length === 0 && <p className="cx-dialog__empty">Nothing to choose from yet.</p>}
            {request.options.map((opt) => (
              <button key={opt.value} type="button" className="cx-nav" onClick={() => onClose(opt.value)}>
                <span className="cx-nav__label">{opt.label}</span>
              </button>
            ))}
          </div>
        )}
        <div className="cx-dialog__actions">
          <Button variant="ghost" onClick={cancel}>
            Cancel
          </Button>
          {request.kind !== "choose" && (
            <Button variant={danger ? "danger" : "primary"} data-primary onClick={accept}>
              {request.kind === "confirm" ? request.confirmLabel : "OK"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
