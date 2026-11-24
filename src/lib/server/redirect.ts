import { NextResponse } from "next/server";

/** Redirect a form POST on the browser's origin, even behind a reverse proxy. */
export function redirectToPath(path: string, headers?: HeadersInit) {
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(path)) {
    throw new Error("Redirect destination must be an encoded path on this site.");
  }

  const responseHeaders = new Headers(headers);
  // request.url can contain the container's internal hostname and port.
  // A relative Location keeps the public origin without trusting proxy headers.
  responseHeaders.set("Location", path);
  return new NextResponse(null, { status: 303, headers: responseHeaders });
}
