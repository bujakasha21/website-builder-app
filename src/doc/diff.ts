import type { Data } from "@puckeditor/core";

export const humanize = (type: string) => type.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

type Block = { type: string; props: Record<string, unknown> };
const blocks = (d: Data | null | undefined): Block[] => [...((d?.content ?? []) as Block[]), ...Object.values((d?.zones ?? {}) as Record<string, Block[]>).flat()];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * What really changed between two versions of a page, in plain words.
 * Used for history labels and for the "Changes" list after Pascal acts, so nothing is claimed that did not happen.
 */
export function describeDataDiff(before: Data | null | undefined, after: Data | null | undefined, name: (type: string) => string = humanize): string[] {
  const out: string[] = [];
  const a = blocks(before), b = blocks(after);
  const ia = new Map(a.map((x) => [x.props.id as string, x]));
  const ib = new Map(b.map((x) => [x.props.id as string, x]));
  for (const x of b) if (!ia.has(x.props.id as string)) out.push(`Added ${name(x.type)}`);
  for (const x of a) if (!ib.has(x.props.id as string)) out.push(`Removed ${name(x.type)}`);
  const orderA = a.map((x) => x.props.id).filter((id) => ib.has(id as string));
  const orderB = b.map((x) => x.props.id).filter((id) => ia.has(id as string));
  if (!same(orderA, orderB)) out.push("Changed the order of sections");
  for (const x of b) {
    const old = ia.get(x.props.id as string);
    if (!old) continue;
    const keys = [...new Set([...Object.keys(old.props), ...Object.keys(x.props)])].filter((k) => k !== "id" && !same(old.props[k], x.props[k]));
    if (keys.length) out.push(`${name(x.type)}: ${keys.join(", ")}`);
  }
  const ra = (before?.root?.props ?? {}) as Record<string, unknown>, rb = (after?.root?.props ?? {}) as Record<string, unknown>;
  const rk = [...new Set([...Object.keys(ra), ...Object.keys(rb)])].filter((k) => !same(ra[k], rb[k]));
  if (rk.length) out.push(`Site settings: ${rk.join(", ")}`);
  return out;
}
