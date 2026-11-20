/** Tiny local-only Chrome protocol client for the offline render's gesture checks. */
export async function attachPreview(profile: string) {
  const [port] = (await Bun.file(`${profile}/DevToolsActivePort`).text()).split("\n");
  const targets: unknown = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  if (!Array.isArray(targets)) throw new Error("Chrome target list is invalid");
  const candidates: readonly unknown[] = targets;
  let endpoint: string | undefined;
  for (const target of candidates) {
    if (typeof target === "object" && target !== null && "type" in target && target.type === "page"
      && "webSocketDebuggerUrl" in target && typeof target.webSocketDebuggerUrl === "string") {
      endpoint = target.webSocketDebuggerUrl;
      break;
    }
  }
  if (!endpoint) throw new Error("Chrome preview page is missing");
  const socket = new WebSocket(endpoint);
  const opened = Promise.withResolvers<void>();
  socket.onopen = () => opened.resolve();
  socket.onerror = () => opened.reject(new Error("Chrome debugger connection failed"));
  let id = 0;
  const pending = new Map<number, ReturnType<typeof Promise.withResolvers<unknown>>>();
  socket.onmessage = event => {
    const message: { readonly id?: number; readonly result?: unknown; readonly error?: unknown } =
      JSON.parse(String(event.data));
    if (message.id === undefined) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  };
  await opened.promise;
  const command = (method: string, params: object = {}): Promise<unknown> => {
    const request = Promise.withResolvers<unknown>();
    pending.set(++id, request);
    socket.send(JSON.stringify({ id, method, params }));
    return request.promise;
  };
  return {
    command,
    async evaluate(expression: string): Promise<unknown> {
      const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (typeof result === "object" && result !== null && "exceptionDetails" in result) {
        throw new Error(`Browser QA failed: ${JSON.stringify(result)}`);
      }
      return result;
    },
    close() { socket.close(); },
  };
}
