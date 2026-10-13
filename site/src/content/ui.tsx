// Building blocks for articles and guides. Pages are rendered to static HTML, so anything interactive
// (the Copy buttons) is wired up by src/static.ts.
import type { ReactNode } from "react";

export type Article = {
  slug: string;
  /** The H1. */
  title: string;
  /** The <title> when the H1 is too long for search results (aim for ≤ 60 characters). */
  metaTitle?: string;
  /** Meta description and the lead paragraph under the H1. */
  description: string;
  /** ISO dates (yyyy-mm-dd). */
  published: string;
  updated?: string;
  body: () => ReactNode;
};

export function Tip({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <aside className="tip">
      {title && <p className="font-semibold text-ink">{title}</p>}
      {children}
    </aside>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd>{children}</kbd>;
}

/** A shell command with a Copy button. */
export function Command({ children }: { children: string }) {
  return (
    <div className="command">
      <pre>
        <code>{children}</code>
      </pre>
      <button type="button" data-copy={children} aria-label="Copy command">
        Copy
      </button>
    </div>
  );
}
