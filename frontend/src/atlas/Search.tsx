import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { WorkspaceModel } from "./useWorkspace";

export function Search({ model }: { model: WorkspaceModel }) {
  const [text, setText] = useState("");
  const deferred = useDeferredValue(text);
  const results = useQuery({
    queryKey: ["search", deferred],
    queryFn: () => model.worker!.search(deferred),
    enabled: !!model.worker && deferred.trim().length > 0,
    staleTime: Infinity,
    gcTime: 60_000,
  });
  return (
    <div className="search-box">
      <label htmlFor="language-search" className="sr-only">
        Search languages, names, or codes
      </label>
      <span aria-hidden="true" className="search-symbol">
        ⌕
      </span>
      <input
        id="language-search"
        type="search"
        autoComplete="off"
        placeholder="Search languages, families, or codes…"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setText("");
          if (event.key === "Enter") {
            const input = event.currentTarget;
            const typed = input.value;
            model.worker?.search(typed).then((rows) => {
              if (rows[0] && input.value === typed) {
                model.select(rows[0].id);
                setText("");
              }
            });
          }
        }}
      />
      {text && (
        <div className="search-results" aria-label="Search results">
          {results.data?.map((node) => (
            <button
              key={node.id}
              onClick={() => {
                model.select(node.id);
                setText("");
              }}
            >
              <strong>{node.name}</strong>
              <span>
                {node.kind} · {node.glottocode ?? node.id}
                {node.iso ? ` · ${node.iso}` : ""}
              </span>
            </button>
          ))}
          {results.data?.length === 0 && <p>No catalogue matches. Try another name or code.</p>}
        </div>
      )}
    </div>
  );
}
