// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from "vitest";
import { cookieDomain, hostLibrary, libraryUrl } from "./library-host";

const at = (hostname: string, protocol = "https:", port = "") => ({ hostname, protocol, port });

describe("library addresses", () => {
  it("reads the library from the subdomain", () => {
    expect(hostLibrary(at("dom.bookkit.net"))).toBe("dom");
    expect(hostLibrary(at("bookkit.net"))).toBeNull();
    expect(hostLibrary(at("www.bookkit.net"))).toBeNull();
    expect(hostLibrary(at("a.b.bookkit.net"))).toBeNull();
    expect(hostLibrary(at("heidi.localhost", "http:", "1420"))).toBe("heidi");
    expect(hostLibrary(at("localhost", "http:", "1420"))).toBeNull();
    expect(hostLibrary(at("thin-place-writer.newmatik.workers.dev"))).toBeNull();
  });
  it("builds library addresses for production and local development", () => {
    expect(libraryUrl("carly", "/the-owl", at("bookkit.net"))).toBe("https://carly.bookkit.net/the-owl");
    expect(libraryUrl(null, "/", at("dom.bookkit.net"))).toBe("https://bookkit.net/");
    expect(libraryUrl("dom", "/x", at("localhost", "http:", "1420"))).toBe("http://dom.localhost:1420/x");
    expect(libraryUrl("dom", "/x", at("127.0.0.1", "http:", "4173"))).toBe("http://dom.localhost:4173/x");
    expect(libraryUrl(null, "/", at("dom.localhost", "http:", "1420"))).toBe("http://localhost:1420/");
  });
  it("shares the session cookie across bookkit.net only", () => {
    expect(cookieDomain(at("dom.bookkit.net"))).toBe(".bookkit.net");
    expect(cookieDomain(at("bookkit.net"))).toBe(".bookkit.net");
    expect(cookieDomain(at("localhost"))).toBeUndefined();
  });
});

describe("cookie session storage", () => {
  beforeEach(() => { document.cookie.split("; ").forEach(c => { const n = c.split("=")[0]; if (n) document.cookie = `${n}=; Max-Age=0; Path=/`; }); localStorage.clear(); });
  it("splits long values into chunks and reads them back", async () => {
    const { cookieStorage } = await import("./cookie-storage");
    const value = JSON.stringify({ access_token: "a".repeat(5000), refresh_token: "r", user: { id: "u", email: "ü@x.de" } });
    cookieStorage.setItem("sb-test-auth-token", value);
    expect(document.cookie).toContain("sb-test-auth-token.1=");
    expect(cookieStorage.getItem("sb-test-auth-token")).toBe(value);
    cookieStorage.setItem("sb-test-auth-token", "short");
    expect(cookieStorage.getItem("sb-test-auth-token")).toBe("short");
    expect(document.cookie).not.toMatch(/sb-test-auth-token\.1=[^;]/);
    cookieStorage.removeItem("sb-test-auth-token");
    expect(cookieStorage.getItem("sb-test-auth-token")).toBeNull();
  });
  it("moves a session saved in localStorage by an older version", async () => {
    const { cookieStorage } = await import("./cookie-storage");
    localStorage.setItem("sb-old-auth-token", "{\"refresh_token\":\"r\"}");
    expect(cookieStorage.getItem("sb-old-auth-token")).toBe("{\"refresh_token\":\"r\"}");
    expect(localStorage.getItem("sb-old-auth-token")).toBeNull();
    expect(cookieStorage.getItem("sb-old-auth-token")).toBe("{\"refresh_token\":\"r\"}");
  });
});
