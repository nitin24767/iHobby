// @vitest-environment node

import { describe, expect, it } from "vitest";
import { redirectToPath } from "@/lib/server/redirect";

describe("redirectToPath", () => {
  it.each(["/", "/dashboard/buyer?status=registered", "/sign-in?status=invalid"])(
    "returns a 303 with the exact root-relative Location %s",
    (path) => {
      const response = redirectToPath(path);

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(path);
    }
  );

  it("preserves additional response headers while setting its own Location", () => {
    const headers = new Headers({ "Retry-After": "2", Location: "https://attacker.example/" });
    const response = redirectToPath("/sign-in?status=rate-limited", headers);

    expect(response.headers.get("location")).toBe("/sign-in?status=rate-limited");
    expect(response.headers.get("retry-after")).toBe("2");
    expect(headers.get("location")).toBe("https://attacker.example/");
  });

  it.each([
    "",
    "dashboard/buyer",
    "https://attacker.example/",
    "//attacker.example/",
    "///attacker.example/",
    "/\\attacker.example/",
    "/dashboard\\buyer"
  ])("rejects an unsafe redirect target %j", (path) => {
    expect(() => redirectToPath(path)).toThrow();
  });

  it("rejects every ASCII control or whitespace character in a target", () => {
    const forbiddenCodes = [...Array.from({ length: 33 }, (_, index) => index), 127];

    for (const code of forbiddenCodes) {
      const path = `/dashboard${String.fromCharCode(code)}buyer`;
      expect(() => redirectToPath(path), `ASCII character ${code}`).toThrow();
    }
  });
});
