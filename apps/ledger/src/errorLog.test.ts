import { Hono } from "hono";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { CAUSE_OMITTED, describeError, logUnhandledErrors } from "./errorLog.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("describeError", () => {
  test("名前・メッセージ・スタックを分け、cause もたどる", () => {
    const cause = new Error("too many SQL variables at offset 207: SQLITE_ERROR");
    const error = new Error("D1_ERROR: too many SQL variables", { cause });

    expect(describeError(error)).toEqual({
      name: "Error",
      message: "D1_ERROR: too many SQL variables",
      stack: error.stack,
      cause: {
        name: "Error",
        message: "too many SQL variables at offset 207: SQLITE_ERROR",
        stack: cause.stack,
      },
    });
  });

  test("Error でない値は文字列にする", () => {
    expect(describeError("failed")).toEqual({ name: "string", message: "failed" });
    expect(describeError(new Error("outer", { cause: 42 })).cause).toEqual({
      name: "number",
      message: "42",
    });
  });

  test("自分を cause に持つ例外でも、決まった深さで止まる", () => {
    const error = new Error("loop");
    error.cause = error;

    let fields = describeError(error);
    let depth = 0;
    while (typeof fields.cause === "object") {
      fields = fields.cause;
      depth += 1;
    }
    expect(depth).toBe(4);
    expect(fields.cause).toBe(CAUSE_OMITTED);
  });
});

describe("logUnhandledErrors", () => {
  const createApp = () => {
    const app = new Hono();
    app.use(logUnhandledErrors);
    app.post("/fail", () => {
      throw new Error("D1_ERROR: too many SQL variables");
    });
    app.get("/ok", (c) => c.text("ok"));
    app.onError((_, c) => c.text("Internal Server Error", 500));
    return app;
  };

  test("捕まえられなかった例外を、リクエストとエラーの中身と一緒に書き、onError のレスポンスを返す", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await createApp().request("/fail", { method: "POST" });

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalledWith("Unhandled error", {
      method: "POST",
      path: "/fail",
      status: 500,
      error: expect.objectContaining({
        name: "Error",
        message: "D1_ERROR: too many SQL variables",
      }),
    });
  });

  test("例外がなければ何も書かない", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await createApp().request("/ok");

    expect(response.status).toBe(200);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
