// Custom SSE proxy — Next.js rewrites can buffer streams; this handler
// forwards the underlying ReadableStream verbatim with proper streaming headers.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

const API_INTERNAL = process.env.API_INTERNAL_BASE || "http://127.0.0.1:8000";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const upstream = await fetch(`${API_INTERNAL}/runs/${id}/events`, {
    cache: "no-store",
    // @ts-expect-error - duplex required for streaming bodies in undici
    duplex: "half",
  });

  // Pipe upstream body straight through with SSE headers
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
      "Content-Encoding": "identity",
    },
  });
}
