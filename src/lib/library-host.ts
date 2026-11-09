/**
 * Libraries live on their own subdomain: dom.bookkit.net. The bare domain
 * (bookkit.net) shows every library you can open.
 */
export const ROOT_DOMAIN = "bookkit.net";

interface Where { hostname: string; protocol: string; port: string }
const here = (): Where => (typeof window === "undefined" ? { hostname: ROOT_DOMAIN, protocol: "https:", port: "" } : window.location);

/** The library this address belongs to, or null on bookkit.net itself. */
export function hostLibrary(where: Where = here()): string | null {
  const h = where.hostname.toLowerCase();
  const sub = h.endsWith("." + ROOT_DOMAIN) ? h.slice(0, -(ROOT_DOMAIN.length + 1)) : h.endsWith(".localhost") ? h.slice(0, -".localhost".length) : "";
  return sub && sub !== "www" && !sub.includes(".") ? sub : null;
}

/** The address of a library (or of bookkit.net when slug is null), with a path. */
export function libraryUrl(slug: string | null, path = "/", where: Where = here()): string {
  const h = where.hostname.toLowerCase();
  const local = h === "localhost" || h === "127.0.0.1" || h.endsWith(".localhost");
  const host = local ? `${slug ? slug + "." : ""}localhost${where.port ? ":" + where.port : ""}` : `${slug ? slug + "." : ""}${ROOT_DOMAIN}`;
  return `${local ? where.protocol : "https:"}//${host}${path}`;
}

/** Cookies set here are shared by bookkit.net and every library subdomain. */
export function cookieDomain(where: Where = here()): string | undefined {
  const h = where.hostname.toLowerCase();
  return h === ROOT_DOMAIN || h.endsWith("." + ROOT_DOMAIN) ? "." + ROOT_DOMAIN : undefined;
}
