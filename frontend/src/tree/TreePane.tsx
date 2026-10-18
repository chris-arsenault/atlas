import { useEffect, useMemo, useRef, useState } from "react";
import type { HierarchyPointNode } from "d3-hierarchy";
import type { WorkspaceModel } from "../atlas/useWorkspace";
import { familyColor } from "../atlas/color";
import { clippedNodes, layoutTree, type TreeEntry } from "./layout";
import { genealogyContext } from "./evidence";

export function TreePane({ model }: { model: WorkspaceModel }) {
  const [depth, setDepth] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [expanded, setExpanded] = useState(new Set<string>());
  const [offset, setOffset] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const context = useMemo(
    () =>
      genealogyContext(
        model.nodes,
        model.release.history.relationships,
        model.state.selected,
        model.state.datedTree,
        model.claimState.variant
      ),
    [
      model.nodes,
      model.release.history.relationships,
      model.state.selected,
      model.state.datedTree,
      model.claimState.variant,
    ]
  );
  const root = useMemo(
    () => layoutTree(context.nodes, context.selected, depth, expanded, model.state.datedTree),
    [context, depth, expanded, model.state.datedTree]
  );
  const { top, all, visible } = clippedNodes(root, offset / zoom, 900 / zoom);
  const height = Math.max(300, Math.max(...all.map((node) => node.x)) - top + 80);
  useEffect(() => {
    const selected = root.descendants().find((node) => node.data.id === context.selected);
    if (selected)
      scroller.current?.scrollTo({
        top: Math.max(0, (selected.x - top) * zoom - 180),
        left: Math.max(0, selected.y * zoom - 150),
      });
  }, [context.selected, root, top, zoom]);
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(`collapsed:${id}`)) {
        next.delete(`collapsed:${id}`);
        next.add(id);
      } else {
        next.add(`collapsed:${id}`);
        next.delete(id);
      }
      return next;
    });
  return (
    <section className="tree-pane" aria-label="Language genealogy">
      <TreeHeading model={model} root={root} />
      <TreeControls depth={depth} zoom={zoom} setDepth={setDepth} setZoom={setZoom} />
      <p className="pane-note">{context.caption}</p>
      {model.frameEntry && (
        <p className="pane-note">
          Outlined nodes have an estimated distribution in the displayed frame.
        </p>
      )}
      <TreeViewport
        model={model}
        root={root}
        visible={visible}
        zoom={zoom}
        top={top}
        height={height}
        scroller={scroller}
        setOffset={setOffset}
        toggle={toggle}
        selected={context.selected}
      />
      <p className="pane-note">Tree zoom and depth are independent of geographic detail.</p>
    </section>
  );
}
type PointNode = HierarchyPointNode<TreeEntry>;
function TreeHeading({ model, root }: { model: WorkspaceModel; root: PointNode }) {
  return (
    <div className="pane-heading">
      <div>
        <span className="eyebrow">Genealogy</span>
        <h2>{model.state.selected ? model.nodes.get(root.data.id)?.name : "Language families"}</h2>
      </div>
      <button className="text-button" onClick={() => model.select(null)}>
        All families
      </button>
    </div>
  );
}
function TreeViewport({
  model,
  root,
  visible,
  zoom,
  top,
  height,
  scroller,
  setOffset,
  toggle,
  selected,
}: {
  model: WorkspaceModel;
  root: PointNode;
  visible: PointNode[];
  zoom: number;
  top: number;
  height: number;
  scroller: React.RefObject<HTMLDivElement | null>;
  setOffset: (value: number) => void;
  toggle: (id: string) => void;
  selected: string | null;
}) {
  return (
    <div
      ref={scroller}
      className="tree-scroll"
      onScroll={(event) => setOffset(event.currentTarget.scrollTop)}
    >
      <svg
        width={Math.max(400, ...root.descendants().map((node) => (node.y + 200) * zoom))}
        height={height * zoom}
        aria-label="Genealogy branches"
      >
        <g transform={`scale(${zoom}) translate(18,${-top + 18})`}>
          {visible
            .filter((node) => node.parent)
            .map((node) => (
              <path
                key={`edge:${node.data.id}`}
                className="tree-link"
                d={`M${node.parent!.y},${node.parent!.x}H${node.y - 18}V${node.x}H${node.y}`}
              />
            ))}
          <TreeNodes model={model} visible={visible} toggle={toggle} selected={selected} />
        </g>
      </svg>
    </div>
  );
}
function TreeNodes({
  model,
  visible,
  toggle,
  selected,
}: {
  model: WorkspaceModel;
  visible: HierarchyPointNode<TreeEntry>[];
  toggle: (id: string) => void;
  selected: string | null;
}) {
  return (
    <>
      {visible.map((node) => (
        <TreeNode
          key={node.data.id}
          node={node}
          model={model}
          selected={selected}
          toggle={toggle}
        />
      ))}
    </>
  );
}
function TreeNode({
  node,
  model,
  selected,
  toggle,
}: {
  node: PointNode;
  model: WorkspaceModel;
  selected: string | null;
  toggle: (id: string) => void;
}) {
  return (
    <g transform={`translate(${node.y},${node.x})`}>
      <circle
        r="4"
        fill={familyColor(model.nodes.get(node.data.id)?.family ?? node.data.id, node.depth)}
        stroke={model.modeled.some((row) => row.subject === node.data.id) ? "#172c32" : "none"}
        strokeWidth="2"
      />
      <foreignObject x="9" y="-15" width="170" height="31">
        <button
          className={selected === node.data.id ? "tree-label selected" : "tree-label"}
          onClick={() => {
            if (node.data.id !== "atlas:root") model.select(node.data.id);
          }}
          aria-pressed={selected === node.data.id}
          title={model.state.datedTree ? node.data.dateLabel : node.data.name}
        >
          {node.data.name}
        </button>
      </foreignObject>
      {model.state.datedTree && (
        <text className="node-date" x="12" y="24">
          {node.data.dateLabel}
        </text>
      )}
      <Expansion node={node} toggle={toggle} />
    </g>
  );
}
function Expansion({ node, toggle }: { node: PointNode; toggle: (id: string) => void }) {
  return (
    <>
      {(!!node.data.hidden || !!node.children?.length) && (
        <foreignObject x="135" y="-15" width="38" height="31">
          <button
            className="expand-button"
            onClick={() => toggle(node.data.id)}
            disabled={node.data.onPath}
            title={
              node.data.onPath ? "Selection ancestry stays expanded" : "Expand or collapse branch"
            }
            aria-label={`${node.data.hidden ? "Expand" : "Collapse"} ${node.data.name}`}
          >
            {node.data.hidden ? `+${node.data.hidden}` : "−"}
          </button>
        </foreignObject>
      )}
    </>
  );
}
function TreeControls({
  depth,
  zoom,
  setDepth,
  setZoom,
}: {
  depth: number;
  zoom: number;
  setDepth: (value: number) => void;
  setZoom: (value: number) => void;
}) {
  return (
    <div className="tree-controls">
      <label>
        Depth{" "}
        <input
          aria-label="Tree depth"
          type="range"
          min="0"
          max="6"
          value={depth}
          onChange={(event) => setDepth(Number(event.target.value))}
        />
      </label>
      <button aria-label="Zoom out genealogy" onClick={() => setZoom(Math.max(0.5, zoom - 0.15))}>
        −
      </button>
      <button aria-label="Zoom in genealogy" onClick={() => setZoom(Math.min(2, zoom + 0.15))}>
        +
      </button>
    </div>
  );
}
