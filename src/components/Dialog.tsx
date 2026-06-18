import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface ConfirmOptions {
  confirmLabel?: string;
  danger?: boolean;
}

interface ConfirmRequest {
  kind: "confirm";
  message: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

interface PromptRequest {
  kind: "prompt";
  message: string;
  defaultValue: string;
  resolve: (value: string | null) => void;
}

export interface ChoiceOption {
  label: string;
  value: string;
}

interface ChooseRequest {
  kind: "choose";
  message: string;
  options: ChoiceOption[];
  resolve: (value: string | null) => void;
}

type DialogRequest = ConfirmRequest | PromptRequest | ChooseRequest;

interface DialogApi {
  confirm: (message: string, opts?: ConfirmOptions) => Promise<boolean>;
  prompt: (message: string, defaultValue?: string) => Promise<string | null>;
  choose: (message: string, options: ChoiceOption[]) => Promise<string | null>;
}

const DialogContext = createContext<DialogApi | null>(null);

/** In-app replacement for window.confirm / window.prompt. */
export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used within <DialogProvider>");
  return ctx;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);

  const confirm = useCallback(
    (message: string, opts?: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setRequest({
          kind: "confirm",
          message,
          confirmLabel: opts?.confirmLabel ?? "OK",
          danger: opts?.danger ?? false,
          resolve,
        });
      }),
    []
  );

  const prompt = useCallback(
    (message: string, defaultValue = "") =>
      new Promise<string | null>((resolve) => {
        setRequest({ kind: "prompt", message, defaultValue, resolve });
      }),
    []
  );

  const choose = useCallback(
    (message: string, options: ChoiceOption[]) =>
      new Promise<string | null>((resolve) => {
        setRequest({ kind: "choose", message, options, resolve });
      }),
    []
  );

  const close = useCallback(
    (result: boolean | string | null) => {
      if (!request) return;
      request.resolve(result as never);
      setRequest(null);
    },
    [request]
  );

  return (
    <DialogContext.Provider value={{ confirm, prompt, choose }}>
      {children}
      {request && <DialogModal request={request} onClose={close} />}
    </DialogContext.Provider>
  );
}

function DialogModal({
  request,
  onClose,
}: {
  request: DialogRequest;
  onClose: (result: boolean | string | null) => void;
}) {
  const [value, setValue] = useState(
    request.kind === "prompt" ? request.defaultValue : ""
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus the most relevant control and trap Escape/Enter.
  useEffect(() => {
    if (request.kind === "prompt") {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      confirmRef.current?.focus();
    }
  }, [request]);

  const accept = () => onClose(request.kind === "prompt" ? value : true);
  const cancel = () =>
    onClose(request.kind === "confirm" ? false : null);
  const danger = request.kind === "confirm" && request.danger;

  const barLabel =
    request.kind === "confirm"
      ? "confirm"
      : request.kind === "choose"
      ? "choose"
      : "input";

  return (
    <div className="dialog-overlay" onMouseDown={cancel}>
      <div
        className={`dialog-box${danger ? " danger" : ""}`}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
          if (e.key === "Enter" && request.kind === "confirm") accept();
        }}
      >
        <div className="dialog-bar">{barLabel}</div>
        <div className="dialog-body">
          <p className="dialog-message">{request.message}</p>
          {request.kind === "prompt" && (
            <input
              ref={inputRef}
              className="dialog-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") accept();
              }}
            />
          )}
          {request.kind === "choose" && (
            <div className="dialog-choices">
              {request.options.length === 0 && (
                <p className="dialog-empty">nothing to choose from yet.</p>
              )}
              {request.options.map((opt) => (
                <button
                  key={opt.value}
                  className="dialog-choice"
                  onClick={() => onClose(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="dialog-actions">
          <button className="dialog-btn" onClick={cancel}>
            [ cancel ]
          </button>
          {request.kind !== "choose" && (
            <button
              ref={confirmRef}
              className={`dialog-btn primary${danger ? " danger" : ""}`}
              onClick={accept}
            >
              [ {request.kind === "confirm" ? request.confirmLabel : "ok"} ]
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
