# Atlas

Static language geography, genealogy and historical evidence on Ahara. React,
MapLibre and D3 run in the browser. S3/CloudFront serve application assets and
independently produced data; the application has no backend request path.

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

`data/sources.lock.json` pins upstream archives and checksums. Production
fetches them at run time, captures them in S3 and verifies them before use.
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
of CI. To consume that output in browser tests, set
`ATLAS_DATA_DIR=/work/.cache/site` in the browser container. `test:release` works
against either the tiny synthetic fixture or that complete prebuilt release.

Layers download only catalogue/metadata/geography archives. Assembly downloads
only catalogue, basemap and phylogeny archives. Layer hand-offs contain the
catalogue, observation records, accounting, source tables and compiled tiles;
raw geometry scratch files are not transferred. Validated immutable releases
publish before a final uncached channel update. Failure before that update
leaves the previous channel intact.

## Deployment and operation

Deployment requires separate authorization and confirmation of the hostname.
Nothing in this repository has been applied to AWS yet. Apply/publish the
shared ahara-infra registration/status/admission changes and shared Terraform
module and shared workflow changes first. The deployment caller passes the
published module commit SHA to Ahara's shared workflow, which checks it out at
`.ahara-tf-patterns` inside the workspace. Terraform sources refer to that
ignored directory. For local development with the existing sibling checkout:

```bash
ln -s ../ahara-tf-patterns .ahara-tf-patterns
```

The manual Deploy code workflow is a reusable-workflow caller. After Atlas's
adapter tests pass, Ahara runs the browser/code checks, builds the ZIP through
its existing Python `scripts/build-lambda.sh` hook, builds the frontend, applies
the single Atlas Terraform state, and publishes dashboards. Atlas has no custom
AWS deploy job or deploy script. The hostname and schedule choice are passed as
public Terraform values. Normal pushes and pull requests run checks with
deployment disabled. The schedule defaults to disabled. CI never starts a data
refresh as a side effect.

Operators start/inspect/stop/redrive executions with ordinary AWS tools:

```bash
aws stepfunctions start-execution --state-machine-arn WORKFLOW_ARN --input '{}'
aws stepfunctions describe-execution --execution-arn EXECUTION_ARN
aws stepfunctions get-execution-history --execution-arn EXECUTION_ARN
aws dynamodb get-item --table-name ahara-pipeline-jobs \
  --key '{"execution_arn":{"S":"EXECUTION_ARN"}}'
```

The managed `aws` command already uses the credential broker. Worker stages and
workflow outcomes appear in the existing Ahara Grafana/Loki/Tempo paths. The
shared DynamoDB registry remains authoritative inventory before the first run;
execution summaries are best effort, and native task history resolves gaps.
The Scheduler delivery queue has an alarm through the existing SNS topic.
