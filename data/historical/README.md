# Historical evidence

The initial licensed phylogenies are the complete Phlorest v1.2 summary trees
derived from Bouckaert et al. (2012) and Chang et al. (2015). Their release READMEs
explicitly license the derived datasets under CC BY 4.0. Cite both the research
and the derived release. The source lock pins their archives and checksums.

The adapter reads `cldf/languages.csv`, `cldf/summary.trees`, node age estimates,
95% age HPD intervals, posterior clade support, and available location/80% HPD
annotations. Every source taxon remains a distinct sample, including multiple
samples mapped to one Glottocode. An inferred clade receives an Atlas identifier
based on its descendant taxa; it is not automatically equated with a named
Glottolog subgroup. The conventional classification stays available separately.

Bouckaert's Bayesian phylogeographic model includes ancestral locations;
Chang's ancestry-constrained lexical model has no corresponding inferred
geography in the supplied summary. The application must show that gap when
selecting the Chang alternative. Locations and uncertainty contours describe
model nodes, not continuously occupied territories or demonstrated migration
routes. Do not extrapolate a node location along its branches.

The raw calibration XML files express ages backwards in years from a model
present. A calendar epoch is not specified by these files or the inspected CLDF
metadata. `clock: model` therefore retains these ages. The timeline labels them
as model years, and calendar mode excludes them. Calendar dates elsewhere use
astronomical years (0 is 1 BCE); model ages are positive years before the source
model present. Do not subtract them from 1950, 2000, publication year, or today.
Source floating point intervals remain available; filtering rounds interval
endpoints outward to whole years and clamps numerical noise around age zero.
An age HPD is a possible node-date interval, not continuous geographic validity.

`claims.json` holds separately reviewed editorial claims, attestations, events,
and source locators. These three hand-entered records are maintained source
inputs bundled with the worker, not automatically downloaded or extracted
claims. The manifest and Sources dialog label their sources as reviewed
editorial input. All other imported historical records come from the pinned
upstream archives fetched by the production pipeline.
Empty collections express coverage gaps. The pipeline
combines these with the source-specific adapters; no claim is generated merely
because a desired event category has no examples. DiACL v1.1 was inspected and
excluded: its metadata leaves licensing empty and its language `time_frame`
column is empty. The CC BY-NC D-PLACE aggregate is also excluded.

Primary references:

Each internal summary-tree node also produces a proposed divergence event,
with its source interval and participants. This expresses branching in the
published model, not independent evidence of migration. Geographic ancestry
links join supplied model-node estimates and retain that qualification.

The initial calendar contact event cites Thompson (2012), *Bengali*, section
1.2, printed p. 3: Persian court use following the thirteenth-century conquest
provides context for Arabic and Persian lexical borrowing in Bengal. Its
start is century-level context; the source supplies no end, historical
coordinates, or route. Catalogue participants identify broad lineages.
Only factual metadata and citations are redistributed, not source prose.
Migration, expansion, shift, and extinction categories remain coverage gaps.

- [Bouckaert et al. paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC4112997/)
- [Bouckaert derived dataset and license](https://github.com/phlorest/bouckaert_et_al2012/tree/v1.2)
- [Chang derived dataset and license](https://github.com/phlorest/chang_et_al2015/tree/v1.2)
