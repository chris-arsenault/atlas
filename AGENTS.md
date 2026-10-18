# Atlas

Static language geography, genealogy, and sourced historical evidence. Read
`docs/ATLAS-PLAN.md` and `sulion plan current` before phase work. Shared pipeline
infrastructure belongs in Ahara; linguistic data processing belongs here.

- The browser talks only to static files. Never add an application backend.
- Production data processing runs through Scheduler/Step Functions/Lambda,
  outside CI. After a successful deployment, CI starts the pipeline for the
  deployed Git revision as its final step; workers transform and publish data.
- Preserve every source row, unresolved join, overlap, date label, and citation.
  A source coordinate is a point, and an undated area is not historical evidence.
- The pipeline models historical distributions between sparse observations.
  Keep authored priors and extrapolations explicit, preserve raw sources, and
  publish computed frames. The browser selects and renders those static frames.
- Authored files use native editing. Source archives and generated releases stay
  in ignored caches; `.sulion-paste` is private and never shipped.
- `make ci` checks code with fixtures. `make data` independently builds the full
  pinned release locally. Neither command publishes to AWS.
