import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyMetaSignature } from "../src/whatsapp/signature.js";

describe("verifyMetaSignature", () => {
  it("accepts the matching Meta signature", () => {
    const body = Buffer.from('{"object":"whatsapp_business_account"}');
    const secret = "a-long-test-secret";
    const digest = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyMetaSignature(body, `sha256=${digest}`, secret)).toBe(true);
  });

  it("rejects missing or malformed signatures", () => {
    const body = Buffer.from("test");
    expect(verifyMetaSignature(body, undefined, "secret-secret")).toBe(false);
    expect(verifyMetaSignature(body, "sha256=abc", "secret-secret")).toBe(false);
  });
});
