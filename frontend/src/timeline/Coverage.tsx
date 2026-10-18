import type { WorkspaceModel } from "../atlas/useWorkspace";
import { memo } from "react";
import type { ModelIndex } from "../data/schema";
import type { AtlasState } from "../atlas/state";
import { firstYear, referenceYear } from "../atlas/state";
import { timeLabel } from "./time";

export function Coverage({ model }: { model: WorkspaceModel }) {
  if (model.release.model)
    return (
      <ModelCoverage
        index={model.release.model}
        variant={model.state.variant}
        family={model.state.family}
        evidence={model.state.evidence}
      />
    );
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

const ModelCoverage = memo(function ModelCoverage({
  index,
  variant,
  family,
  evidence,
}: { index: ModelIndex } & Pick<AtlasState, "variant" | "family" | "evidence">) {
  const scenario = variant in index.scenarios ? variant : index.defaultScenario;
  const frames = index.frames.filter((frame) => frame.scenario === scenario);
  const counts = frames.map((frame) =>
    Object.entries(frame.coverage)
      .filter(([id]) => !family || id === family)
      .reduce(
        (sum, [, kinds]) =>
          sum +
          Object.entries(kinds)
            .filter(([kind]) => evidence.includes(kind as (typeof evidence)[number]))
            .reduce((subtotal, [, count]) => subtotal + count, 0),
        0
      )
  );
  const peak = Math.max(1, ...counts);
  const span = referenceYear - firstYear;
  return (
    <svg
      className="coverage-chart"
      viewBox="0 0 640 30"
      preserveAspectRatio="none"
      role="img"
      aria-label="Modeled language coverage across time"
    >
      {frames.map((frame, i) => (
        <rect
          key={frame.artifact}
          x={((frame.start - firstYear) / span) * 640}
          width={Math.max(0.5, ((frame.end - frame.start + 1) / span) * 640)}
          y={30 - (Math.log1p(counts[i]) / Math.log1p(peak)) * 28}
          height={(Math.log1p(counts[i]) / Math.log1p(peak)) * 28}
        >
          <title>
            {timeLabel(frame.start)}–{timeLabel(frame.end)}: {counts[i]} estimated lineages; count
            is not confidence
          </title>
        </rect>
      ))}
    </svg>
  );
});
