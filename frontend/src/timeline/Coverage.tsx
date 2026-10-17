import type { WorkspaceModel } from "../atlas/useWorkspace";

export function Coverage({ model }: { model: WorkspaceModel }) {
  const counts = model.view?.coverage ?? [];
  const peak = Math.max(1, ...counts);
  const histogram = model.state.clock === "model" ? [...counts].reverse() : counts;
  return (
    <svg
      className="coverage-chart"
      viewBox="0 0 640 30"
      preserveAspectRatio="none"
      role="img"
      aria-label="Source evidence coverage across time"
    >
      {histogram.map((count, index) => (
        <rect
          key={index}
          x={index * 10}
          y={30 - (count / peak) * 28}
          width="8"
          height={(count / peak) * 28}
        >
          <title>{count} supported claims</title>
        </rect>
      ))}
    </svg>
  );
}
