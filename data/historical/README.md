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

The calibration XML expresses ages backwards from a model present. The primary
publications establish that present as 2000 CE: Chang, printed p. 195 footnote 1
and p. 213 Table 8, explicitly defines BP; Bouckaert's original supplementary
Google Earth KML places modern tips at `2000-06-01`. The source lock records
these calendar epochs, references and locators. Earlier implementation inspected
only XML and CLDF and incorrectly treated the epochs as unknown.

The importer converts age intervals to calendar dates as `[2000 - upper age,
2000 - lower age]`, rounds outward to whole years and clamps numerical noise
around age zero. Original floating point ages, medians, labels and the verified
epoch remain available. All product dates use astronomical year integers
(0 is 1 BCE) displayed as BCE/CE. Calendar point estimates are emitted by the
producer alongside the intervals. The browser reads these published values;
it never loads the source lock or converts model ages. Unreviewed source
clocks never acquire an assumed epoch. An age HPD is uncertainty about a node
date, not continuous geographic validity or occupation.

`claims.json` holds separately reviewed editorial claims, attestations, events,
and source locators. These three hand-entered records are maintained source
inputs captured from a specific Git commit by the independent pipeline, not
bundled with worker code or extracted from the cited publications. The manifest
and Sources dialog label their sources as reviewed
editorial input. All other imported historical records come from the pinned
upstream archives fetched by the production pipeline.
Empty collections express coverage gaps. The pipeline
combines these with the source-specific adapters; no claim is generated merely
because a desired event category has no examples. DiACL v1.1 was inspected and
excluded: its metadata leaves licensing empty and its language `time_frame`
column is empty. The CC BY-NC D-PLACE aggregate is also excluded.

To add evidence, edit the schema-versioned `claims.json` collections with stable
IDs, sources, locators, original date labels, calendar boundaries, evidence type,
and qualifications. Keep competing chronologies as distinct claims. CI validates
the source contract; joins against the complete catalogue happen during pipeline
execution. A commit stores source input only. The scheduled or explicitly started
pipeline captures it, combines it with pinned archives, validates the release,
and publishes through the existing channel. Source revision and file checksums
travel with the release. No generated release belongs in Git or the frontend.

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
- [Chang paper and calendar definition](https://linguistics.berkeley.edu/~garrett/ChangEtAl-2015.pdf)
- [Bouckaert original calendar animation](https://pmc.ncbi.nlm.nih.gov/articles/instance/4112997/bin/NIHMS607856-supplement-GoogleEarth_KML.kml)
