import type { HistoricalClaim, Languoid } from "../data/schema";

export function genealogyContext(
  nodes: Map<string, Languoid>,
  claims: HistoricalClaim[],
  selected: string | null,
  dated: boolean,
  variant: string
) {
  const chosen = selected ? nodes.get(selected) : null;
  if (!dated && !isHistorical(selected))
    return conventional(nodes, selected, "Glottolog classification · undated ancestry");
  const active = claims.filter((claim) => variant === "all" || claim.variant === variant);
  const identifiers = new Set(active.flatMap((claim) => [claim.parent, claim.child]));
  const supported = new Map([...nodes].filter(([id]) => identifiers.has(id)));
  const mapped = matchingSample(supported, selected);
  if (isHistorical(selected) && !mapped)
    return {
      nodes: supported,
      selected: null,
      caption:
        "Selection belongs to another reconstruction. The chosen alternative is shown; no ancestor is substituted.",
    };
  if (chosen && !mapped)
    return conventional(
      nodes,
      selected,
      "No source-dated estimate for this selection in this alternative. Classification remains undated."
    );
  return {
    nodes: supported,
    selected: mapped,
    caption: dated
      ? "Source model ages · no asserted calendar epoch"
      : "Source phylogeny · undated layout",
  };
}
function isHistorical(id: string | null) {
  return id?.startsWith("history:") ?? false;
}
function matchingSample(nodes: Map<string, Languoid>, selected: string | null): string | null {
  if (!selected) return null;
  if (nodes.has(selected)) return selected;
  return [...nodes.values()].find((node) => node.glottocode === selected)?.id ?? null;
}
function conventional(nodes: Map<string, Languoid>, selected: string | null, caption: string) {
  return {
    nodes: new Map([...nodes].filter(([id]) => !id.startsWith("history:"))),
    selected,
    caption,
  };
}
