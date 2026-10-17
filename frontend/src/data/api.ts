import { z } from "zod";
import {
  manifestSchema,
  nodeSchema,
  observationSchema,
  historySchema,
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
  const manifest = manifestSchema.parse(await staticJson(channel.manifest, signal, channel.sha256));
  const base = channel.manifest.replace("manifest.json", "");
  if (!base.endsWith(`${manifest.release}/`)) throw new Error("Dataset release identity mismatch");
  const artifact = (name: string) =>
    staticJson(base + name, signal, manifest.artifacts[name].sha256);
  const [nodes, observations, history] = await Promise.all([
    artifact("catalogue.json"),
    artifact("observations-index.json"),
    artifact("history.json"),
  ]);
  return {
    manifest,
    base,
    nodes: z.array(nodeSchema).parse(nodes),
    observations: z.array(observationSchema).parse(observations),
    history: historySchema.parse(history),
  };
}

export async function loadDetail(release: Release, id: string, signal: AbortSignal) {
  const shard = (await sha256(new TextEncoder().encode(id).buffer)).slice(0, 2);
  const name = `details/${shard}.json`;
  const details = await staticJson(
    release.base + name,
    signal,
    release.manifest.artifacts[name].sha256
  );
  return z.record(z.string(), z.unknown()).parse(details)[id];
}
