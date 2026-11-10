import { useEffect, useState } from "react";

export type PublicPage =
  | { kind: "marketing"; section?: "features" | "pricing" | "studio" | "standard" | "ai-policy" }
  | { kind: "docs"; slug: string }
  | { kind: "signup"; initialSlug?: string; initialPlan?: string }
  | { kind: "login" }
  | { kind: "app" };

export function parsePublicLocation(
  pathname = typeof window !== "undefined" ? window.location.pathname : "/",
  search = typeof window !== "undefined" ? window.location.search : "",
  hash = typeof window !== "undefined" ? window.location.hash : "",
  isAuthenticated = false,
  hasSubdomain = false
): PublicPage {
  const clean = pathname.replace(/\/+$/, "") || "/";
  const params = new URLSearchParams(search);

  if (clean === "/docs" || clean.startsWith("/docs/")) {
    const slug = clean.slice("/docs".length).replace(/^\/+/, "") || "introduction";
    return { kind: "docs", slug };
  }

  if (clean === "/signup" || clean === "/subscribe" || clean === "/start") {
    return {
      kind: "signup",
      initialSlug: params.get("slug") ?? undefined,
      initialPlan: params.get("plan") ?? undefined,
    };
  }

  if (clean === "/login" || clean === "/sign-in") {
    // Once signed in, the sign-in address leads into the app.
    return isAuthenticated ? { kind: "app" } : { kind: "login" };
  }

  if (clean === "/features") {
    return { kind: "marketing", section: "features" };
  }

  if (clean === "/pricing") {
    return { kind: "marketing", section: "pricing" };
  }

  if (clean === "/marketing") {
    return { kind: "marketing" };
  }

  if (!isAuthenticated) {
    if (hasSubdomain) {
      return { kind: "login" };
    }
    const h = hash.replace(/^#/, "");
    if (h === "features" || h === "pricing" || h === "studio" || h === "standard" || h === "ai-policy") {
      return { kind: "marketing", section: h };
    }
    return { kind: "marketing" };
  }

  return { kind: "app" };
}

/** The address to show after signing in on the sign-in page: the app's home. */
export function leaveSignInAddress(): void {
  if (typeof window === "undefined") return;
  const clean = window.location.pathname.replace(/\/+$/, "");
  if (clean === "/login" || clean === "/sign-in") window.history.replaceState(null, "", "/" + window.location.search + window.location.hash);
}

export function navigatePublic(url: string): void {
  if (typeof window === "undefined") return;
  if (window.location.pathname + window.location.search + window.location.hash !== url) {
    window.history.pushState(null, "", url);
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function usePublicLocation(isAuthenticated: boolean, hasSubdomain: boolean): PublicPage {
  const [page, setPage] = useState<PublicPage>(() =>
    parsePublicLocation(window.location.pathname, window.location.search, window.location.hash, isAuthenticated, hasSubdomain)
  );

  useEffect(() => {
    const update = () => {
      setPage(
        parsePublicLocation(window.location.pathname, window.location.search, window.location.hash, isAuthenticated, hasSubdomain)
      );
    };
    update();
    window.addEventListener("popstate", update);
    window.addEventListener("hashchange", update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("hashchange", update);
    };
  }, [isAuthenticated, hasSubdomain]);

  return page;
}
