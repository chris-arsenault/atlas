# Atlas

Static language geography, genealogy, and sourced historical evidence. Read
`docs/ATLAS-PLAN.md` and `sulion plan current` before phase work. Shared pipeline
infrastructure belongs in Ahara; linguistic data processing belongs here.

- The browser talks only to static files. Never add an application backend.
- Production data processing runs through Scheduler/Step Functions/Lambda,
  independently of CI and frontend deployment.
- Preserve every source row, unresolved join, overlap, date label, and citation.
  A source coordinate is a point, and an undated area is not historical evidence.
- Authored files use native editing. Source archives and generated releases stay
  in ignored caches; `.sulion-paste` is private and never shipped.
- `make ci` checks code with fixtures. `make data` independently builds the full
  pinned release locally. Neither command publishes to AWS.
- Deployment, pushes, and hostname confirmation require separate authorization.
