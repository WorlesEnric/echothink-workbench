import { describe, it, expect } from "vitest";
import {
  canonicalJSONStringify,
  sha256OfCanonical,
  sha256OfString,
} from "./index.js";

describe("canonicalJSONStringify", () => {
  it("sorts object keys at every level", () => {
    const a = canonicalJSONStringify({ b: 1, a: { d: 2, c: 3 } });
    const b = canonicalJSONStringify({ a: { c: 3, d: 2 }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("drops undefined object properties and nulls undefined array items", () => {
    expect(canonicalJSONStringify({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalJSONStringify([1, undefined, 2])).toBe("[1,null,2]");
  });

  it("supports toJSON (Date)", () => {
    const d = new Date("2026-05-29T18:00:00.000Z");
    expect(canonicalJSONStringify({ d })).toBe(
      '{"d":"2026-05-29T18:00:00.000Z"}',
    );
  });

  it("throws on circular references", () => {
    const o: Record<string, unknown> = {};
    o.self = o;
    expect(() => canonicalJSONStringify(o)).toThrow(/circular/);
  });

  it("throws on non-finite numbers and bigint", () => {
    expect(() => canonicalJSONStringify({ x: Number.NaN })).toThrow();
    expect(() => canonicalJSONStringify({ x: 1n })).toThrow();
  });
});

describe("sha256 helpers", () => {
  it("is stable across key order", () => {
    expect(sha256OfCanonical({ a: 1, b: 2 })).toBe(
      sha256OfCanonical({ b: 2, a: 1 }),
    );
  });

  it("formats as sha256:<hex>", () => {
    const h = sha256OfString("hello");
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
    // Known sha256("hello")
    expect(h).toBe(
      "sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });
});
