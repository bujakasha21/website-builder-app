import type { Data } from "@puckeditor/core";
import type { Project } from "@/lib/types";

export type Block = { type: string; props: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** what Pascal knows when he answers; no project = the dashboard */
export interface PascalContext { project?: Project; data?: Data; selectedId?: string | null }

/** something missing or weak on a site, found by "Check my site" */
export interface Issue { id: string; title: string; why: string; fixLabel?: string; fix?: Omit<Proposal, "reply"> }

/** Pascal's answer. Nothing is changed until the user confirms `apply`, `ops`, `go` or `open`. */
export interface Proposal {
  reply: string;
  /** plain-language list of what will change, shown before the user confirms */
  changes?: string[];
  apply?: (data: Data) => Data;
  /** site-level changes as command-layer operations (src/doc/ops.ts), e.g. theme or languages */
  ops?: unknown[];
  /** a page to open */
  go?: string;
  open?: "settings";
  confirmLabel?: string;
  issues?: Issue[];
  /** tappable follow-ups */
  examples?: string[];
}

/**
 * The seam for a real model: the chat bar, suggestions and "Check my site" only talk to this interface.
 * `local` (rule-based, no model) ships today; a hosted provider can replace it without touching the UI.
 */
export interface PascalProvider {
  id: string;
  /** shown in the chat bar so nobody mistakes rules for a language model */
  label: string;
  respond(input: string, ctx: PascalContext): Promise<Proposal>;
}
