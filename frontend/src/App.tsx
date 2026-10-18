import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadRelease } from "./data/api";
import type { Release } from "./data/schema";
import { useWorkspace, type WorkspaceModel } from "./atlas/useWorkspace";
import { Search } from "./atlas/Search";
import { MapPane } from "./map/MapPane";
import { TreePane } from "./tree/TreePane";
import { Details } from "./evidence/Details";
import { Timeline } from "./timeline/Timeline";

export function App() {
  const release = useQuery({
    queryKey: ["release"],
    queryFn: ({ signal }) => loadRelease(signal),
    staleTime: Infinity,
    retry: 1,
  });
  if (release.isPending)
    return (
      <main className="loading-screen" aria-busy="true">
        <span className="wordmark">
          atlas<span>✳</span>
        </span>
        <h1>Opening the language atlas</h1>
        <p>Loading catalogue and source evidence…</p>
      </main>
    );
  if (release.error)
    return (
      <main className="loading-screen">
        <h1>Dataset unavailable</h1>
        <p role="alert">{release.error.message}</p>
        <button onClick={() => release.refetch()}>Retry loading dataset</button>
      </main>
    );
  return <Workspace release={release.data} />;
}
function Workspace({ release }: { release: Release }) {
  const model = useWorkspace(release);
  const [pane, setPane] = useState("map");
  const [sources, setSources] = useState(false);
  return (
    <main className="atlas-app">
      <Header model={model} openSources={() => setSources(true)} />
      <div className="mobile-tabs" role="group" aria-label="Workspace pane">
        <button aria-pressed={pane === "map"} onClick={() => setPane("map")}>
          Map
        </button>
        <button aria-pressed={pane === "tree"} onClick={() => setPane("tree")}>
          Genealogy
        </button>
      </div>
      <Timeline model={model} />
      <div className={`workspace show-${pane}`}>
        <MapPane model={model} />
        <TreePane model={model} />
        <Details model={model} />
      </div>
      {model.queryError && (
        <p role="alert">Catalogue queries unavailable. Reload to rebuild the index.</p>
      )}
      <footer className="app-footer">
        <span>
          {release.manifest.counts.catalogue.toLocaleString()} catalogue entries ·{" "}
          {release.manifest.counts.observations.toLocaleString()} geographic claims
        </span>
        <span>Ahara / Atlas · {release.manifest.release.slice(0, 8)}</span>
      </footer>
      {sources && <Sources model={model} close={() => setSources(false)} />}
    </main>
  );
}
function Header({ model, openSources }: { model: WorkspaceModel; openSources: () => void }) {
  return (
    <header className="app-header">
      <div className="brand">
        <span className="wordmark">
          atlas<span aria-hidden="true">✳</span>
        </span>
        <span className="brand-subtitle">Languages across place & time</span>
      </div>
      <Search model={model} />
      <button className="sources-button" onClick={openSources}>
        Sources & coverage ↗
      </button>
    </header>
  );
}
function Sources({ model, close }: { model: WorkspaceModel; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="sources-dialog"
      aria-label="Sources and coverage"
      onCancel={close}
    >
      <div className="pane-heading">
        <h2>Sources & coverage</h2>
        <button aria-label="Close sources" onClick={close}>
          ×
        </button>
      </div>
      <p>
        The catalogue, a digitized distribution, and a historical reconstruction are different
        claims. This atlas preserves their dates and qualifications.
      </p>
      <ul>
        {model.release.manifest.sources.map((source) => (
          <li key={source.id}>
            <a href={source.reference} target="_blank" rel="noreferrer">
              {source.citation}
            </a>
            <p>
              {source.license}
              {source.version ? ` · release ${source.version}` : ""}
              {source.ingestion === "reviewed-editorial" ? " · reviewed editorial input" : ""}
            </p>
            {typeof source.datingReference === "string" && (
              <p>
                <a href={source.datingReference} target="_blank" rel="noreferrer">
                  Calendar dating reference
                </a>
                {typeof source.datingLocator === "string" ? ` · ${source.datingLocator}` : ""}
              </p>
            )}
          </li>
        ))}
      </ul>
      <h3>Dates and coverage</h3>
      <p>
        The timeline displays published calendar dates as BCE and CE. Historical regions estimate
        language presence between sparse observations. They overlap and include authored priors;
        their envelopes are model sensitivity, not measured confidence. The 2007 endpoint shows the
        Atlas reference map; undated traditional maps remain inspectable in each language&apos;s
        source records.
      </p>
      <ModelExplanation model={model} />
      <h3>Known gaps</h3>
      <ul>
        {model.release.manifest.coverage.gaps.map((gap) => (
          <li key={gap}>{gap}</li>
        ))}
      </ul>
      <p>
        Contemporary and traditional Atlas areas retain their original reference labels. A
        language&apos;s absence at a historical date does not establish its extinction.
      </p>
    </dialog>
  );
}

function ModelExplanation({ model }: { model: WorkspaceModel }) {
  const index = model.release.model;
  if (!index) return null;
  return (
    <>
      <h3>How historical presence is estimated</h3>
      <p>{index.description}</p>
      <ul>
        {index.assumptions.map((assumption) => (
          <li key={assumption}>{assumption}</li>
        ))}
      </ul>
      <ul>
        {Object.entries(index.references).map(([id, source]) => (
          <li key={id}>
            <a href={source.reference} target="_blank" rel="noreferrer">
              {source.citation}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
