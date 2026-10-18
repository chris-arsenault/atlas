import { hierarchy, tree, type HierarchyPointNode } from "d3-hierarchy";
import type { Languoid } from "../data/schema";
import { datingLabel, estimatedYear } from "../timeline/time";

export interface TreeEntry {
  id: string;
  name: string;
  children: TreeEntry[];
  hidden: number;
  onPath: boolean;
  dateLabel: string;
}
export function layoutTree(
  nodes: Map<string, Languoid>,
  selected: string | null,
  depth: number,
  expanded: Set<string>,
  dated = false
) {
  const children = new Map<string, string[]>();
  for (const node of nodes.values()) {
    const parent = node.parent ?? "atlas:root";
    children.set(parent, [...(children.get(parent) ?? []), node.id]);
  }
  const ancestors = ancestorIds(nodes, selected);
  const root = treeRoot(nodes, selected, ancestors);
  const build = (id: string, level: number): TreeEntry => {
    const descendants = children.get(id) ?? [];
    const onPath = ancestors.includes(id);
    const visible =
      onPath || (!expanded.has(`collapsed:${id}`) && (level < depth || expanded.has(id)));
    return {
      id,
      name: nodes.get(id)?.name ?? "Languages of the world",
      children: visible ? descendants.map((child) => build(child, level + 1)) : [],
      hidden: visible ? 0 : descendants.length,
      onPath,
      dateLabel: sourceDateLabel(nodes.get(id)),
    };
  };
  const layout = tree<TreeEntry>().nodeSize([dated ? 56 : 34, 185])(hierarchy(build(root, 0)));
  if (dated) positionBySourceAge(layout, nodes);
  return layout;
}
function treeRoot(nodes: Map<string, Languoid>, selected: string | null, ancestors: string[]) {
  if (!selected) return "atlas:root";
  return nodes.get(ancestors.at(-1) ?? selected)?.id ?? "atlas:root";
}
function sourceDateLabel(node: Languoid | undefined) {
  if (!node?.dating) return "Undated";
  return datingLabel(node.dating);
}
function positionBySourceAge(root: HierarchyPointNode<TreeEntry>, nodes: Map<string, Languoid>) {
  const ages = root
    .descendants()
    .map((node) => nodes.get(node.data.id)?.dating)
    .filter((dating) => dating && dating.clock !== "model" && dating.kind !== "undated")
    .map((dating) => estimatedYear(dating!))
    .filter((age): age is number => age != null);
  const oldest = Math.min(0, ...ages);
  const newest = Math.max(2007, ...ages);
  root.each((node) => {
    const dating = nodes.get(node.data.id)?.dating;
    const year =
      dating && dating.clock !== "model" && dating.kind !== "undated"
        ? estimatedYear(dating)
        : null;
    node.y = year == null ? 1050 + node.depth * 20 : ((year - oldest) / (newest - oldest)) * 900;
    if (node.data.id === "atlas:root") node.y = -20;
  });
}
export function ancestorIds(nodes: Map<string, Languoid>, id: string | null) {
  const result: string[] = [];
  while (id && !result.includes(id)) {
    result.push(id);
    id = nodes.get(id)?.parent ?? null;
  }
  return result;
}
export function clippedNodes(root: HierarchyPointNode<TreeEntry>, offset: number, height: number) {
  const top = root.descendants().reduce((value, node) => Math.min(value, node.x), 0) - 24;
  const all = root.descendants();
  return {
    top,
    all,
    visible: all.filter(
      (node) => node.x - top > offset - 100 && node.x - top < offset + height + 100
    ),
  };
}
