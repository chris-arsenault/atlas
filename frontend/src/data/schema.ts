import { z } from "zod";
import type { Geometry } from "geojson";

export const datingSchema = z.object({
  kind: z.enum(["undated", "reference", "validity", "uncertain"]),
  clock: z.enum(["calendar", "model"]).optional(),
  year: z.number().int().optional(),
  start: z.number().int().nullable().optional(),
  end: z.number().int().nullable().optional(),
  label: z.string().optional(),
  sourceAgeInterval: z.tuple([z.number(), z.number()]).optional(),
  sourceMedianAge: z.number().nullable().optional(),
  sourceCalendarEpoch: z.number().int().optional(),
});
export type Dating = z.infer<typeof datingSchema>;
export const nodeSchema = z.object({
  id: z.string(),
  glottocode: z.string().nullable(),
  name: z.string(),
  aliases: z.array(z.string()),
  kind: z.enum(["family", "language", "dialect", "unresolved", "reconstructed"]),
  parent: z.string().nullable(),
  family: z.string(),
  iso: z.string().nullable(),
  point: z.tuple([z.number(), z.number()]).nullable(),
  status: z.string(),
  bookkeeping: z.boolean(),
  sources: z.array(z.string()),
  dating: datingSchema.optional(),
  variant: z.string().optional(),
  historicalSpan: z.string().nullable().optional(),
});
export type Languoid = z.infer<typeof nodeSchema>;
export const observationSchema = z.object({
  id: z.string(),
  subject: z.string(),
  layer: z.string(),
  dating: datingSchema,
  evidence: z.enum(["map-derived", "attested", "reconstructed", "hypothesized"]),
  variant: z.string().nullable(),
});
export type Observation = z.infer<typeof observationSchema>;
export const detailSchema = observationSchema
  .extend({
    source: z.string(),
    locator: z.unknown(),
    rawDate: z.string(),
    geographicUncertainty: z.string(),
    note: z.string(),
    transformations: z.array(z.string()),
    geometry: z.custom<Geometry>().nullable().optional(),
    uncertaintyGeometry: z.custom<Geometry>().nullable().optional(),
    posterior: z.number().nullable().optional(),
    model: z
      .object({
        label: z.string(),
        method: z.string(),
        use: z.string(),
        point: z.tuple([z.number(), z.number()]),
        uncertaintyKm: z.number(),
        anchorYear: z.number(),
        calibration: z
          .object({
            subject: z.string(),
            prior: z
              .object({
                year: z.number(),
                uncertaintyYears: z.number(),
                source: z.string(),
                basis: z.string(),
              })
              .optional(),
            study: z
              .object({ year: z.number(), sourceNode: z.string(), dating: datingSchema })
              .optional(),
          })
          .nullable()
          .optional(),
        stageSource: z.string().nullable().optional(),
        selectionSubjects: z.array(z.string()).optional(),
        continuationBasis: z
          .record(
            z.string(),
            z.object({
              stages: z.array(z.string()),
              source: z.string(),
              basis: z.string(),
            })
          )
          .optional(),
      })
      .optional(),
  })
  .passthrough();
export type ObservationDetail = z.infer<typeof detailSchema>;
export const sourceSchema = z
  .object({
    id: z.string(),
    citation: z.string(),
    reference: z.string().url(),
    license: z.string(),
    version: z.string().optional(),
    sha256: z.string().optional(),
  })
  .passthrough();
export const manifestSchema = z.object({
  schema: z.literal(1),
  dataContract: z.literal("calendar-v1"),
  model: z.string().optional(),
  release: z.string().regex(/^[a-f0-9]{24}$/),
  sources: z.array(sourceSchema),
  artifacts: z.record(
    z.string(),
    z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number() })
  ),
  counts: z.object({ catalogue: z.number(), observations: z.number() }).passthrough(),
  coverage: z
    .object({
      historicalObservations: z.number(),
      variants: z.array(z.string()),
      gaps: z.array(z.string()),
      dateSystem: z.string(),
    })
    .passthrough(),
});
export type Manifest = z.infer<typeof manifestSchema>;
export interface HistoricalClaim {
  id: string;
  parent: string;
  child: string;
  source: string;
  locator: string;
  dating: Dating;
  evidence: Observation["evidence"];
  variant: string;
  posterior: number | null;
  sampleGlottocode: string | null;
}
export interface HistoricalEvent {
  id: string;
  name: string;
  kind: string;
  participants: string[];
  source: string;
  locator: string;
  dating: Dating;
  evidence: Observation["evidence"];
  variant: string | null;
  note: string;
  geometry: Geometry | null;
}
export interface History {
  relationships: HistoricalClaim[];
  events: HistoricalEvent[];
  attestations: {
    id: string;
    subject: string;
    source: string;
    locator: string;
    dating: Dating;
    note: string;
    evidence: Observation["evidence"];
    variant: string | null;
  }[];
  observations: ObservationDetail[];
}
const evidenceSchema = observationSchema.shape.evidence;
export const historySchema = z.object({
  relationships: z.array(
    z.object({
      id: z.string(),
      parent: z.string(),
      child: z.string(),
      source: z.string(),
      locator: z.string(),
      dating: datingSchema,
      evidence: evidenceSchema,
      variant: z.string(),
      posterior: z.number().nullable(),
      sampleGlottocode: z.string().nullable(),
    })
  ),
  events: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.string(),
      participants: z.array(z.string()),
      source: z.string(),
      locator: z.string(),
      dating: datingSchema,
      evidence: evidenceSchema,
      variant: z.string().nullable(),
      note: z.string(),
      geometry: z.custom<Geometry>().nullable(),
    })
  ),
  attestations: z.array(
    z.object({
      id: z.string(),
      subject: z.string(),
      source: z.string(),
      locator: z.string(),
      dating: datingSchema,
      note: z.string(),
      evidence: evidenceSchema,
      variant: z.string().nullable(),
    })
  ),
  observations: z.array(detailSchema),
});
export interface Release {
  manifest: Manifest;
  base: string;
  nodes: Languoid[];
  observations: Observation[];
  history: History;
  model?: ModelIndex;
}

export const modelFrameEntrySchema = z.object({
  scenario: z.string(),
  start: z.number().int(),
  end: z.number().int(),
  year: z.number().int(),
  artifact: z.string(),
  count: z.number().int(),
  methods: z.record(z.string(), z.number()),
  families: z.record(z.string(), z.number()),
  coverage: z.record(z.string(), z.record(z.string(), z.number())),
});
export const modelIndexSchema = z.object({
  schema: z.literal(1),
  id: z.string(),
  defaultScenario: z.string(),
  description: z.string(),
  assumptions: z.array(z.string()),
  references: z.record(z.string(), z.object({ citation: z.string(), reference: z.string().url() })),
  frames: z.array(modelFrameEntrySchema),
  scenarios: z.record(z.string(), z.unknown()),
});
export const modelFrameSchema = z.object({
  schema: z.literal(1),
  scenario: z.string(),
  year: z.number().int(),
  start: z.number().int(),
  end: z.number().int(),
  observations: z.array(detailSchema),
});
export type ModelIndex = z.infer<typeof modelIndexSchema>;
export type ModelFrameEntry = z.infer<typeof modelFrameEntrySchema>;
