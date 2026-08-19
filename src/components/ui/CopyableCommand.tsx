import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";

interface CopyableCommandProps {
  command: string;
  label?: string;
  className?: string;
}

/**
 * A terminal plate: recessed well, functional edge, mono type — the same
 * construction as an input, because that is what it is (a value you take out
 * rather than put in). The label above it uses the Rule 5 micro-caps, so it
 * matches every other field label in the app.
 */
export function CopyableCommand({ command, label, className = "" }: CopyableCommandProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(command)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }, [command]);

  return (
    <div className={className}>
      {label && <div className="micro-caps mb-1 text-muted-foreground">{label}</div>}
      <div className="relative overflow-x-auto rounded-control border border-border-control bg-input p-2.5 font-mono text-xs shadow-(--shadow-well)">
        <span className="pr-8 text-foreground">{command}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy command"}
          className="focus-ring-tight absolute right-1 top-1 flex size-7 items-center justify-center rounded-control text-muted-foreground transition-colors duration-100 ease-snap hover:bg-surface-3 hover:text-foreground"
        >
          {copied ? (
            <Check className="size-3.5 text-success" strokeWidth={2} />
          ) : (
            <Copy className="size-3.5" strokeWidth={1.75} />
          )}
        </button>
      </div>
    </div>
  );
}
