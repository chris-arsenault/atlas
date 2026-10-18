/** Synthetic browser cases. Generated release files never enter source control. */
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { History, Languoid, ObservationDetail, Dating } from "../src/data/schema";

const output = resolve("../.cache/browser-fixtures", process.env.BROWSER ?? "local");
const dating: Dating = {
  kind: "uncertain",
  clock: "calendar",
  start: 400,
  end: 1237,
  year: 856,
  sourceCalendarEpoch: 2000,
  sourceAgeInterval: [763, 1600],
  sourceMedianAge: 1144,
};
function node(id: string, name: string, parent: string | null = null): Languoid {
  return {
    id,
    name,
    parent,
    aliases: [],
    kind: "language",
    glottocode: id,
    family: "indo1319",
    iso: null,
    point: null,
    status: "Synthetic test case",
    bookkeeping: false,
    sources: ["fixture"],
  };
}
function observation(id: string, subject: string, layer: string): ObservationDetail {
  return {
    id,
    subject,
    layer,
    source: "fixture",
    locator: "Synthetic browser case",
    rawDate: "Synthetic reference",
    dating: { kind: "reference", year: 2007 },
    evidence: "map-derived",
    variant: null,
    geographicUncertainty: "Synthetic geometry; not linguistic evidence.",
    note: "For automated tests only.",
    transformations: [],
  };
}
function catalogue(): Languoid[] {
  return [
    { ...node("indo1319", "Indo-European"), kind: "family" },
    { ...node("beng1280", "Bengali", "indo1319"), aliases: ["Bangla"], point: [90, 24] },
    { ...node("basq1248", "Basque"), family: "basq1248" },
    { ...node("sume1241", "Sumerian"), family: "sume1241" },
    node("fixture:overlap", "Synthetic overlap"),
    node("fixture:continuation", "Synthetic continuation"),
    ...["bouckaert", "chang"].flatMap((variant): Languoid[] => [
      {
        ...node(`history:${variant}:ancestor:test`, `Synthetic ancestor (${variant})`),
        glottocode: null,
        kind: "reconstructed",
        variant,
        dating,
        point: variant === "bouckaert" ? [89, 25] : null,
      },
      {
        ...node(
          `history:${variant}:taxon:Bengali`,
          `Bengali (${variant})`,
          `history:${variant}:ancestor:test`
        ),
        glottocode: "beng1280",
        variant,
        point: variant === "bouckaert" ? [90, 24] : null,
        dating: {
          kind: "uncertain",
          clock: "calendar",
          start: 2000,
          end: 2000,
          year: 2000,
          sourceMedianAge: 0,
          sourceCalendarEpoch: 2000,
        },
      },
    ]),
  ];
}
function historical(): History {
  const detail: ObservationDetail = {
    ...observation("fixture:model-location", "history:bouckaert:ancestor:test", "historical"),
    variant: "bouckaert",
    evidence: "reconstructed",
    dating,
    geometry: { type: "Point", coordinates: [89, 25] },
  };
  return {
    relationships: ["bouckaert", "chang"].map((variant) => ({
      id: `fixture:${variant}:relation`,
      parent: `history:${variant}:ancestor:test`,
      child: `history:${variant}:taxon:Bengali`,
      source: "fixture",
      locator: "Synthetic phylogeny",
      dating,
      evidence: "reconstructed",
      variant,
      posterior: 0.8,
      sampleGlottocode: "beng1280",
    })),
    observations: [detail],
    attestations: [
      {
        id: "fixture:attestation",
        subject: "beng1280",
        source: "fixture",
        locator: "Synthetic attestation",
        dating: { kind: "uncertain", start: 800, end: 1099 },
        note: "Synthetic browser case.",
        evidence: "attested",
        variant: null,
      },
    ],
    events: [
      {
        id: "bengal-persian-arabic-contact",
        name: "Synthetic contact event",
        kind: "contact",
        participants: ["beng1280"],
        source: "fixture",
        locator: "Synthetic event",
        dating: { kind: "uncertain", start: 1200, end: 1299 },
        evidence: "attested",
        variant: null,
        note: "Synthetic browser case; not source evidence.",
        geometry: null,
      },
    ],
  };
}
function hash(bytes: string | Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}
function artifactWriter(
  directory: string,
  artifacts: Record<string, { sha256: string; bytes: number }>
) {
  return (name: string, value: unknown) => {
    const bytes = JSON.stringify(value);
    const path = resolve(directory, name);
    mkdirSync(resolve(path, ".."), { recursive: true });
    writeFileSync(path, bytes);
    artifacts[name] = { sha256: hash(bytes), bytes: Buffer.byteLength(bytes) };
  };
}
export function prepareFixture() {
  writeFixture(false);
  return writeFixture(true);
}
function writeFixture(modeled: boolean) {
  cpSync(resolve("public"), output, { recursive: true });
  const release = modeled ? "000000000000000000000002" : "000000000000000000000001";
  const directory = resolve(output, `data/v1/releases/${release}`);
  const history = historical(),
    nodes = catalogue();
  const observations = ["contemporary", "traditional"].flatMap((layer) => [
    observation(`fixture:${layer}:bengali`, "beng1280", layer),
    observation(`fixture:${layer}:overlap`, "fixture:overlap", layer),
  ]);
  observations.push(
    observation("fixture:contemporary:basque", "basq1248", "contemporary"),
    ...history.observations
  );
  const artifacts: Record<string, { sha256: string; bytes: number }> = {};
  const write = artifactWriter(directory, artifacts);
  if (modeled) writeModel(write);
  write("catalogue.json", nodes);
  write("history.json", history);
  write(
    "observations-index.json",
    observations.map(({ id, subject, layer, dating, evidence, variant }) => ({
      id,
      subject,
      layer,
      dating,
      evidence,
      variant,
    }))
  );
  const shards: Record<string, Record<string, ObservationDetail>> = {};
  for (const row of observations) {
    const shard = hash(row.id).slice(0, 2);
    shards[shard] ??= {};
    shards[shard][row.id] = row;
  }
  for (const [shard, rows] of Object.entries(shards)) write(`details/${shard}.json`, rows);
  writeTiles(directory, artifacts);
  const manifest = {
    schema: 1,
    dataContract: "calendar-v1",
    ...(modeled ? { model: "model/index.json" } : {}),
    release,
    artifacts,
    sources: [
      {
        id: "fixture",
        citation: "Synthetic browser fixture; not linguistic evidence.",
        reference: "https://example.invalid/fixture",
        license: "CC0-1.0",
      },
    ],
    counts: { catalogue: nodes.length, observations: observations.length },
    coverage: {
      historicalObservations: 1,
      variants: ["bouckaert", "chang"],
      gaps: ["Synthetic browser fixture only."],
      dateSystem: "astronomical years; inclusive intervals",
    },
  };
  const content = JSON.stringify(manifest);
  writeFileSync(resolve(directory, "manifest.json"), content);
  writeFileSync(
    resolve(output, modeled ? "data/v1/model-channel.json" : "data/v1/channel.json"),
    JSON.stringify({
      schema: 1,
      manifest: `/data/v1/releases/${release}/manifest.json`,
      sha256: hash(content),
    })
  );
  return output;
}
function writeTiles(
  directory: string,
  artifacts: Record<string, { sha256: string; bytes: number }>
) {
  for (const name of ["basemap.pmtiles", "contemporary.pmtiles", "traditional.pmtiles"]) {
    const bytes = readFileSync(resolve("tooling/fixtures/map.pmtiles"));
    writeFileSync(resolve(directory, name), bytes);
    artifacts[name] = { sha256: hash(bytes), bytes: bytes.length };
  }
}
function writeModel(write: ReturnType<typeof artifactWriter>) {
  const frames = ["chang", "bouckaert"].flatMap((scenario) =>
    [0, 800].map((start) => {
      const rows: ObservationDetail[] = [
        {
          ...observation(`model:${scenario}:sume1241`, "sume1241", "modeled"),
          evidence: "reconstructed",
          variant: scenario,
          dating: { kind: "validity", start, end: start + 799, year: start + 399 },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [44, 31],
                [47, 31],
                [47, 34],
                [44, 34],
                [44, 31],
              ],
            ],
          },
          model: {
            label: "Sumerian",
            method: "historical-stage",
            use: start === 0 ? "learned and scribal" : "synthetic alternative stage",
            point: [45, 32],
            uncertaintyKm: 200,
            anchorYear: 100,
            selectionSubjects: ["sume1241", "fixture:continuation"],
          },
        },
      ];
      const artifact = `model/${scenario}/${start}.json`;
      write(artifact, {
        schema: 1,
        scenario,
        start,
        end: start + 799,
        year: start + 399,
        observations: rows,
      });
      return {
        scenario,
        start,
        end: start + 799,
        year: start + 399,
        artifact,
        count: 1,
        methods: { "historical-stage": 1 },
        families: { sume1241: 1 },
        coverage: { sume1241: { reconstructed: 1 } },
      };
    })
  );
  write("model/index.json", {
    schema: 1,
    id: "synthetic-model",
    defaultScenario: "chang",
    description: "Synthetic model; not historical evidence.",
    assumptions: ["Synthetic frame for browser tests."],
    references: {},
    frames,
    scenarios: { chang: {}, bouckaert: {} },
  });
}
export default function setup() {
  if (!process.env.ATLAS_DATA_DIR) prepareFixture();
}
