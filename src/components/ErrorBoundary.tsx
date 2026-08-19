import React from "react";
import i18n from "../i18n";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  /** React's own "the error happened inside <X> inside <Y>" trace. */
  componentStack: string | null;
  copied: boolean;
}

/**
 * Last line of defence for a render/commit crash.
 *
 * The message alone is rarely enough to act on — a DOM error like
 * "Failed to execute 'removeChild' on 'Node'" names no component at all. So
 * this keeps React's component stack and puts it one click away, because a
 * screenshot of this screen is usually the only artefact a crash leaves
 * behind.
 */
export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null, copied: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, errorInfo);
    this.setState({ componentStack: errorInfo.componentStack ?? null });
  }

  private buildReport(): string {
    const { error, componentStack } = this.state;
    return [
      `Snowi renderer crash — ${window.location.hash || window.location.pathname}`,
      "",
      error?.stack || error?.message || String(error),
      "",
      componentStack ? `Component stack:${componentStack}` : "Component stack: (unavailable)",
    ].join("\n");
  }

  handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(this.buildReport());
      this.setState({ copied: true });
    } catch {
      // Clipboard blocked — the stack is still on screen and in the console.
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const { error, componentStack, copied } = this.state;

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="w-full max-w-lg space-y-4">
            <div className="space-y-1.5 text-center">
              <h1 className="text-lg font-semibold text-foreground">
                {i18n.t("errorBoundary.title")}
              </h1>
              <p className="text-sm text-muted-foreground">{i18n.t("errorBoundary.description")}</p>
            </div>

            {error && (
              <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-1 p-3 text-left text-xs text-destructive">
                {error.message}
              </pre>
            )}

            {componentStack && (
              <details className="rounded-md bg-surface-1 text-left">
                <summary className="cursor-pointer select-none rounded-md px-3 py-2 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                  {i18n.t("errorBoundary.details")}
                </summary>
                <pre className="max-h-56 overflow-auto px-3 pb-3 text-[11px] leading-relaxed text-muted-foreground">
                  {componentStack.trim()}
                </pre>
              </details>
            )}

            <div className="flex items-center justify-center gap-2">
              <button
                onClick={this.handleReload}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {i18n.t("errorBoundary.reload")}
              </button>
              <button
                onClick={this.handleCopy}
                className="inline-flex items-center justify-center rounded-md border border-border-subtle px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                {copied ? i18n.t("errorBoundary.copied") : i18n.t("errorBoundary.copy")}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
