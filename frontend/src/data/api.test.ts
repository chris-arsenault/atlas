import { afterEach, expect, it, vi } from "vitest";
import { loadRelease, sha256 } from "./api";

afterEach(() => vi.unstubAllGlobals());
it("rejects incompatible and escaping release channels", async () => {
  vi.stubGlobal(
    "fetch",
    async () => new Response(JSON.stringify({ schema: 2, manifest: "/private", sha256: "bad" }))
  );
  await expect(loadRelease(new AbortController().signal)).rejects.toThrow();
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          schema: 1,
          manifest: "https://other.example/manifest.json",
          sha256: "bad",
        })
      )
  );
  await expect(loadRelease(new AbortController().signal)).rejects.toThrow("channel path");
});
it("rejects changed immutable manifest bytes before loading artifacts", async () => {
  let requests = 0;
  vi.stubGlobal("fetch", async () => {
    requests++;
    return new Response(
      requests === 1
        ? JSON.stringify({
            schema: 1,
            manifest: `/data/v1/releases/${"a".repeat(24)}/manifest.json`,
            sha256: "b".repeat(64),
          })
        : "{}"
    );
  });
  await expect(loadRelease(new AbortController().signal)).rejects.toThrow("integrity failure");
  expect(requests).toBe(2);
});
it("uses SHA-256 byte identity", async () => {
  expect(await sha256(new TextEncoder().encode("abc").buffer)).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
});
