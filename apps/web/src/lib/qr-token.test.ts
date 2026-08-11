import { describe, expect, it } from "vitest";
import { extractQrToken } from "./qr-token";

describe("extractQrToken", () => {
  it("accepts a raw token", () => {
    expect(extractQrToken("qr-token-123")).toBe("qr-token-123");
  });

  it("accepts a full direct-scan URL", () => {
    expect(
      extractQrToken("https://app.example.com/assets/qr/qr-token-123"),
    ).toBe("qr-token-123");
  });

  it("ignores query strings, hashes, and trailing slashes", () => {
    expect(
      extractQrToken(
        "https://app.example.com/assets/qr/qr-token-123/?utm=scan#top",
      ),
    ).toBe("qr-token-123");
  });

  it("decodes URL-encoded token text when valid", () => {
    expect(extractQrToken("https://app.example.com/assets/qr/qr%2Dtoken")).toBe(
      "qr-token",
    );
  });

  it("returns an empty string for blank scans", () => {
    expect(extractQrToken("   ")).toBe("");
  });
});
