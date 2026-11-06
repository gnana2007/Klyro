import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

// Node's built-in fetch can be unavailable on managed Windows networks even
// when native HTTPS works. Keep outbound responses bounded and abortable.
export async function networkFetch(
  input: string | URL | Request,
  init: RequestInit = {},
): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("Unsupported outbound URL protocol");
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  const body = init.body == null ? undefined : String(init.body);
  return new Promise<Response>((resolve, reject) => {
    const req = request(
      url,
      {
        method: init.method || "GET",
        headers: Object.fromEntries(new Headers(init.headers).entries()),
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 8_000_000) {
            req.destroy(new Error("Outbound response exceeds size limit"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          const headers = new Headers();
          for (const [key, value] of Object.entries(res.headers))
            if (value !== undefined)
              headers.set(key, Array.isArray(value) ? value.join(", ") : value);
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode || 502,
              statusText: res.statusMessage,
              headers,
            }),
          );
        });
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    const abort = () =>
      req.destroy(init.signal?.reason || new Error("Aborted"));
    if (init.signal?.aborted) abort();
    else init.signal?.addEventListener("abort", abort, { once: true });
    req.on("close", () => init.signal?.removeEventListener("abort", abort));
    req.end(body);
  });
}
