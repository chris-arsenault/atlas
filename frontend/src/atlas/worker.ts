import type { Languoid, Release } from "../data/schema";
import type { Query, ViewQuery, ViewResult } from "./index";
import IndexWorker from "./query.worker?worker";

export class QueryWorker {
  private readonly worker = new IndexWorker();
  private serial = 0;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  constructor() {
    this.worker.onmessage = (event: MessageEvent<{ id: number; result: unknown }>) => {
      this.pending.get(event.data.id)?.resolve(event.data.result);
      this.pending.delete(event.data.id);
    };
    this.worker.onerror = () => this.close();
  }
  async initialize(release: Release) {
    await this.request({ type: "init", release });
    return this;
  }
  async search(text: string): Promise<Languoid[]> {
    return this.request({ type: "search", text }) as Promise<Languoid[]>;
  }
  async view(state: ViewQuery["state"]): Promise<ViewResult> {
    return this.request({ type: "view", state }) as Promise<ViewResult>;
  }
  private request(
    request: Query | ViewQuery | { type: "init"; release: Release }
  ): Promise<unknown> {
    const id = ++this.serial;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, request });
    });
  }
  close() {
    this.worker.terminate();
    for (const task of this.pending.values())
      task.reject(new Error("Catalogue worker unavailable"));
    this.pending.clear();
  }
}
