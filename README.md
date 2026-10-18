# Atlas

Static language geography, genealogy and historical evidence on Ahara. React,
MapLibre and D3 run in the browser. S3/CloudFront serve application assets and
independently produced data; the application has no backend request path.

Ahara's shared OG server supplies the HTML shell and social preview tags using
static site metadata. Icons and the preview image live in `frontend/public/`;
the application and datasets still load directly from S3 through CloudFront.
The OG server does not query a database or process Atlas data.

The workspace has one map and one BCE/CE timeline. Its 2007 endpoint shows the
Atlas reference snapshot. Earlier dates show sourced reconstructed locations,
written attestations and events, with coverage marks and navigation to nearby
evidence. Indo-European reconstructions retain date and location uncertainty;
they are not historical territories. Source and alternative filters live in
evidence options. Undated traditional maps remain accessible through each
language's source records. Scrubbing updates the view immediately and saves a
shareable URL after interaction settles.

The data pipeline is EventBridge Scheduler → Step Functions Standard → Python
Lambda. Ahara owns the shared DynamoDB registration/status tables, status
recorder and central observability. Atlas owns the workflow, worker, sources,
output bucket and its registration. See [the plan](docs/ATLAS-PLAN.md) and
[the platform contract](../ahara/docs/data-pipelines.md).

## Local checks

Use Python 3.12, uv 0.12.3, Node 24, pnpm 10.29.3, Terraform 1.14+ and Docker.

```bash
pnpm --dir frontend install --frozen-lockfile
make ci
make lambda
```

`make lambda` uses a local Amazon Linux build container to export
`.cache/lambda.zip`. It compiles pinned Tippecanoe, installs locked Python
dependencies, and imports the worker and compiles/decodes a tile in a clean
Lambda Python runtime. It neither publishes an image nor uses a private ECR
repository. Terraform deploys the ZIP into the managed Python runtime.

Browser tests run through the existing Ahara browser runtime:

```bash
docker run --rm --ipc=host -e BROWSER=chromium -v "$PWD:/work" \
  -w /work/frontend ahara-browser-tests:1.63.0-pnpm-10.29.3 pnpm test:browser
```

Use `firefox` or `webkit` for the other engines. `pnpm --dir frontend build`
followed by the same container command with `pnpm test:release` exercises the
built application using Vite preview. Tests close that temporary server.
Local serving checks do not establish deployed CloudFront behavior.

## Data ownership

`data/sources.lock.json` pins upstream archives and checksums. Along with
`data/mappings/glottolog.json` and `data/historical/claims.json`, it is an
authored source input in Git. CI validates these files without fetching archives,
producing releases, or publishing data. The Lambda ZIP contains code and tools;
it does not contain these inputs.

After a successful code deployment, the final CI job starts the independent
pipeline with the deployed Git SHA. Scheduled and operator executions also remain
available. CI starts the execution; pipeline workers perform all source fetching,
transformations, validation and data publication.

At source capture, the independent pipeline resolves its configured `main` ref
(or an execution's `revision`) to one commit. It persists that commit before
downloading inputs, records every input file's SHA-256, and stores the exact
snapshot under `sources/authored/` beside captured upstream archives. Retries
retain the first resolved revision. Import and assembly stages read and verify
that snapshot, never a moving Git ref or packaged data. A release includes the
input files, commit, and checksums as immutable artifacts. Editing an input does
not publish a release or require rebuilding worker code.

Date normalization, source joins and corrections belong in the pipeline. The
browser reads the published `calendar-v1` contract, formats years as BCE/CE and
queries those records. It does not import source configuration or reinterpret
older releases. An incompatible release produces an explicit dataset error
until an independent pipeline execution publishes compatible data.

Downloaded sources, intermediate files and complete releases stay in ignored
`.cache/` directories locally and in the data bucket in production. The
frontend build excludes data files. Tiny synthetic browser cases live in
`frontend/tooling/fixtures`; their generated test release also stays in `.cache`.

`data/historical/claims.json` is a small, explicitly editorial source containing
two attestations and one contact event. Those records are maintained by hand
with citations; the pipeline does not extract them from the cited web pages.
The remaining phylogenetic records are imported from fetched source archives.
See [historical source semantics](data/historical/README.md).

For a full local data build, install the pinned Tippecanoe 2.79.0 compiler on
`PATH`, then run `make data`. This fetches complete pinned sources independently
of CI and captures the current authored files once. Its provenance explicitly
says `working-tree`, with the base commit and exact file checksums; it does not
claim uncommitted input is a Git revision. For separate local stages, run
`uv run --project tools/data atlas-data fetch` first; `layer` and `assemble`
reuse `.cache/work/inputs`.
Local commands never publish. To consume that output in browser tests, set
`ATLAS_DATA_DIR=/work/.cache/site` in the browser container. `test:release` works
against either the tiny synthetic fixture or that complete prebuilt release.

Layers download only catalogue/metadata/geography archives. Assembly downloads
only catalogue, basemap and phylogeny archives. Layer hand-offs contain the
catalogue, observation records, accounting, source tables and compiled tiles;
raw geometry scratch files are not transferred. Validated immutable releases
publish before a final uncached channel update. Failure before that update
leaves the previous channel intact.

## Deployment and operation

Pushes to `main` and manual CI runs on `main` use Ahara's shared workflow to
build and deploy Atlas at `atlas.ahara.io`. Pull requests run the checks without
deploying. Shared ahara-infra registration/status/admission resources and the
shared Terraform module and workflow must be published before the first Atlas
deployment. Atlas pins the published module commit in its CI caller; Ahara
checks it out at `.ahara-tf-patterns` inside the workspace. Terraform sources
refer to that ignored directory. For local development with the existing sibling
checkout:

```bash
ln -s ../ahara-tf-patterns .ahara-tf-patterns
```

After Atlas's adapter tests pass, Ahara runs the browser/code checks, builds the
ZIP through its existing Python `scripts/build-lambda.sh` hook, builds the
frontend, applies the single Atlas Terraform state, and publishes dashboards.
The final Atlas job starts `atlas-pipeline-languages` with the deployed commit
as its `revision`. Pull requests and failed deployments do not start a refresh.
The job returns the execution ARN without waiting for data processing to finish;
the pipeline validates and publishes the release before advancing the channel.
Terraform owns the hostname and schedule configuration. The schedule defaults
to disabled; the deployment trigger operates independently of that schedule.

Operators start/inspect/stop/redrive executions with ordinary AWS tools:

```bash
aws stepfunctions start-execution --state-machine-arn WORKFLOW_ARN --input '{}'
aws stepfunctions start-execution --state-machine-arn WORKFLOW_ARN \
  --input '{"revision":"FULL_GIT_COMMIT_SHA"}'
aws stepfunctions describe-execution --execution-arn EXECUTION_ARN
aws stepfunctions get-execution-history --execution-arn EXECUTION_ARN
aws dynamodb get-item --table-name ahara-pipeline-jobs \
  --key '{"execution_arn":{"S":"EXECUTION_ARN"}}'
```

The second start example selects an exact authored revision; use one start
command for the intended manual run. Successful deployments start this same
pipeline automatically. CI does not build a dataset or update the data channel.

In this environment, use the pre-wrapped `aws` command or `with-cred -- aws`;
other installations can use their ordinary AWS credential configuration. Worker stages and
workflow outcomes appear in the existing Ahara Grafana/Loki/Tempo paths. The
shared DynamoDB registry remains authoritative inventory before the first run;
execution summaries are best effort, and native task history resolves gaps.
The Scheduler delivery queue has an alarm through the existing SNS topic.
