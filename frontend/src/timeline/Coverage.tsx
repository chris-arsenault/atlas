import type { WorkspaceModel } from "../atlas/useWorkspace";

export function Coverage({ model }: { model: WorkspaceModel }) {
  const counts = model.view?.coverage ?? [];
  const peak = Math.max(1, ...counts);
  const histogram = counts;
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
          y={30 - (Math.log1p(count) / Math.log1p(peak)) * 28}
          width="8"
          height={(Math.log1p(count) / Math.log1p(peak)) * 28}
        >
          <title>{count} supported claims</title>
        </rect>
      ))}
    </svg>
  );
}
