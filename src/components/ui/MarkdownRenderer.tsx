import Markdown from "react-markdown";
import { cn } from "../lib/utils";
import { parseNoteLink } from "../../utils/chatCitations";

interface MarkdownRendererProps {
  content: string;
  className?: string;
  /**
   * Opens a note the content links to (`snowy-note:<id>`). Without it those
   * links render as plain text rather than as a dead external link — the
   * scheme means nothing to a browser.
   */
  onOpenNote?: (noteId: number) => void;
}

/** A citation marker: small, superscript, and clearly not body text. */
function CitationLink({
  noteId,
  onOpen,
  children,
}: {
  noteId: number;
  onOpen: (noteId: number) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(noteId)}
      className={cn(
        "mx-px inline-flex h-4 min-w-4 translate-y-[-2px] items-center justify-center rounded-sm px-1 align-baseline",
        "bg-primary/12 text-[10px] font-semibold leading-none text-primary",
        "transition-colors duration-100 hover:bg-primary/22",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      {children}
    </button>
  );
}

export function MarkdownRenderer({ content, className, onOpenNote }: MarkdownRendererProps) {
  return (
    <div className={cn("prose prose-sm max-w-none", className)}>
      <Markdown
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg font-bold mb-2 mt-3 first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-semibold mb-2 mt-3 first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold mb-1.5 mt-2 first:mt-0">{children}</h3>
          ),
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          a: ({ href, children }) => {
            const noteId = parseNoteLink(href);
            if (noteId != null) {
              // No handler means nowhere to go; render the marker inert rather
              // than as a link that does nothing when clicked.
              if (!onOpenNote) return <>{children}</>;
              return (
                <CitationLink noteId={noteId} onOpen={onOpenNote}>
                  {children}
                </CitationLink>
              );
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-link underline decoration-link/30 hover:decoration-link/60 transition-colors"
              >
                {children}
              </a>
            );
          },
          code: ({ children }) => (
            <code className="rounded-control border border-border-subtle bg-surface-3 px-1 py-0.5 font-mono text-xs">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="mb-2 overflow-x-auto rounded-control border border-border-subtle bg-surface-3 p-2 text-xs">
              {children}
            </pre>
          ),
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-current/30 pl-3 italic my-2">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-current/20 my-3" />,
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}

export default MarkdownRenderer;
