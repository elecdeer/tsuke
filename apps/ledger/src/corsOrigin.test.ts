import { describe, expect, test } from "vite-plus/test";
import { isAllowedCorsOrigin, isAllowedWriteRequest } from "./corsOrigin.ts";

describe("isAllowedWriteRequest", () => {
  const url = "https://tsuke.example.workers.dev/api/transactions";

  test.each(["POST", "PUT", "PATCH", "DELETE"])("別サイトからの %s は拒否する", (method) => {
    expect(isAllowedWriteRequest({ method, url, origin: "https://evil.example.com" })).toBe(false);
  });

  test.each([
    "http://localhost.example.com",
    "https://tsuke.example.workers.dev.example.com",
    "http://tsuke.example.workers.dev",
    "null",
    "",
  ])("自分自身や許可先に似ているだけの Origin %j からの書き込みは拒否する", (origin) => {
    expect(isAllowedWriteRequest({ method: "POST", url, origin })).toBe(false);
  });

  test.each([
    "https://tsuke.example.workers.dev",
    "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
    "http://localhost:5173",
  ])("自分自身と許可先の %s からの書き込みは通す", (origin) => {
    expect(isAllowedWriteRequest({ method: "POST", url, origin })).toBe(true);
  });

  test("Origin のない書き込みはブラウザ以外からのものとして通す", () => {
    expect(isAllowedWriteRequest({ method: "POST", url, origin: undefined })).toBe(true);
  });

  test.each(["GET", "HEAD", "OPTIONS"])("%s は別サイトからでも通す", (method) => {
    expect(isAllowedWriteRequest({ method, url, origin: "https://evil.example.com" })).toBe(true);
  });
});

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
