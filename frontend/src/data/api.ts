import { z } from "zod";
import {
  manifestSchema,
  nodeSchema,
  observationSchema,
  historySchema,
  detailSchema,
  modelIndexSchema,
  modelFrameSchema,
  type ModelFrameEntry,
  type Release,
} from "./schema";

const channelSchema = z.object({ schema: z.literal(1), manifest: z.string(), sha256: z.string() });

export async function sha256(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function staticJson(path: string, signal: AbortSignal, checksum: string | null = null) {
  const response = await fetch(path, { signal, cache: checksum ? "force-cache" : "no-store" });
  if (!response.ok) throw new Error(`Dataset file unavailable (${response.status}): ${path}`);
  const buffer = await response.arrayBuffer();
  if (checksum && (await sha256(buffer)) !== checksum)
    throw new Error(`Dataset integrity failure: ${path}`);
  return JSON.parse(new TextDecoder().decode(buffer)) as unknown;
}

export async function loadRelease(signal: AbortSignal): Promise<Release> {
  const channel = channelSchema.parse(await staticJson("/data/v1/channel.json", signal));
  if (!/^\/data\/v1\/releases\/[a-f0-9]{24}\/manifest\.json$/.test(channel.manifest))
    throw new Error("Unsupported dataset channel path");
  const rawManifest = await staticJson(channel.manifest, signal, channel.sha256);
  if (z.object({ dataContract: z.literal("calendar-v1") }).safeParse(rawManifest).success === false)
    throw new Error(
      "This dataset needs an independent pipeline refresh before it can be displayed."
    );
  const manifest = manifestSchema.parse(rawManifest);
  const base = channel.manifest.replace("manifest.json", "");
  if (!base.endsWith(`${manifest.release}/`)) throw new Error("Dataset release identity mismatch");
  const artifact = (name: string) =>
    staticJson(base + name, signal, manifest.artifacts[name].sha256);
  const [nodes, observations, history, model] = await Promise.all([
    artifact("catalogue.json"),
    artifact("observations-index.json"),
    artifact("history.json"),
    manifest.model ? artifact(manifest.model) : undefined,
  ]);
  return {
    manifest,
    base,
    nodes: z.array(nodeSchema).parse(nodes),
    observations: z.array(observationSchema).parse(observations),
    history: historySchema.parse(history),
    model: model ? modelIndexSchema.parse(model) : undefined,
  };
}

export async function loadModelFrame(
  release: Release,
  entry: ModelFrameEntry,
  signal: AbortSignal
) {
  const artifact = release.manifest.artifacts[entry.artifact];
  if (!artifact || !/^model\/[\w-]+\/-?\d+\.json$/.test(entry.artifact))
    throw new Error("Unsupported model frame artifact");
  const frame = modelFrameSchema.parse(
    await staticJson(release.base + entry.artifact, signal, artifact.sha256)
  );
  if (
    frame.scenario !== entry.scenario ||
    frame.start !== entry.start ||
    frame.end !== entry.end ||
    frame.year !== entry.year ||
    frame.observations.length !== entry.count
  )
    throw new Error("Model frame identity mismatch");
  return frame;
}

export async function loadDetail(release: Release, id: string, signal: AbortSignal) {
  const shard = (await sha256(new TextEncoder().encode(id).buffer)).slice(0, 2);
  const name = `details/${shard}.json`;
  const details = await staticJson(
    release.base + name,
    signal,
    release.manifest.artifacts[name].sha256
  );
  const detail = z.record(z.string(), z.unknown()).parse(details)[id];
  return detailSchema.parse(detail);
}
