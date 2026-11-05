import { Component, type ReactNode } from "react";

/**
 * Last-resort crash screen. Without it a render error unmounts the whole tree
 * and leaves a blank page; this shows the error (and stack) instead, with ways
 * out: reload, or go back to the root URL.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[cortex] render crash:", error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash-screen">
        <div className="crash-box">
          <div className="crash-title">✗ cortex crashed</div>
          <div className="crash-url">{window.location.href}</div>
          <pre className="crash-msg">{String(error?.stack || error)}</pre>
          <div className="crash-actions">
            <button className="dialog-btn" onClick={() => window.location.reload()}>
              [ reload ]
            </button>
            <button className="dialog-btn" onClick={() => (window.location.href = "/")}>
              [ go home ]
            </button>
          </div>
        </div>
      </div>
    );
  }
}
