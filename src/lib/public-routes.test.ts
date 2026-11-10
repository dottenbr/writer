import { describe, expect, it } from "vitest";
import { parsePublicLocation } from "./public-routes";

describe("public routes", () => {
  it("shows the sign-in page until you are signed in, then the app", () => {
    expect(parsePublicLocation("/login", "", "", false)).toEqual({ kind: "login" });
    expect(parsePublicLocation("/login", "", "", true)).toEqual({ kind: "app" });
    expect(parsePublicLocation("/sign-in/", "", "", true)).toEqual({ kind: "app" });
  });
});
