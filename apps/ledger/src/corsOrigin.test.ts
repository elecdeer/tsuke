import { describe, expect, test } from "vite-plus/test";
import { isAllowedCorsOrigin } from "./corsOrigin.ts";

describe("isAllowedCorsOrigin", () => {
  test.each([
    "http://localhost",
    "http://localhost:5173",
    "http://127.0.0.1",
    "http://127.0.0.1:5173",
  ])("ローカル開発の %s は許可する", (origin) => {
    expect(isAllowedCorsOrigin(origin)).toBe(true);
  });

  test("拡張機能の origin は許可する", () => {
    expect(isAllowedCorsOrigin("chrome-extension://abcdefghijklmnopabcdefghijklmnop")).toBe(true);
  });

  test.each([
    "http://localhost.example.com",
    "http://127.0.0.1.example.com",
    "http://localhost:5173.example.com",
    "http://localhost:password@example.com",
    "http://example.com#localhost",
    "http://example.com",
    "https://example.com",
  ])("名前や URL の一部が似ているだけの別のサイト %s は拒否する", (origin) => {
    expect(isAllowedCorsOrigin(origin)).toBe(false);
  });

  test.each(["https://localhost:5173", "https://127.0.0.1:5173", "ftp://localhost"])(
    "http 以外のローカルの %s は拒否する",
    (origin) => {
      expect(isAllowedCorsOrigin(origin)).toBe(false);
    },
  );

  test("chrome-extension:// で始まらない形は拒否する", () => {
    expect(isAllowedCorsOrigin("chrome-extension:abcdefghijklmnop")).toBe(false);
  });

  test.each(["", "null", "localhost", "http://", "chrome-extension://a b"])(
    "解釈できない origin %j は拒否する",
    (origin) => {
      expect(isAllowedCorsOrigin(origin)).toBe(false);
    },
  );
});
