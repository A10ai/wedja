import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { logger, createLogger } from "@/lib/client-logger";

/* eslint-disable @typescript-eslint/no-explicit-any */

const spies: Record<string, any> = {};
const PREFIX_RE = (level: string) =>
  new RegExp(`^\\[\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z\\] \\[${level}\\] \\[wedja\\]$`);

beforeEach(() => {
  for (const m of ["log", "debug", "info", "warn", "error"] as const) {
    spies[m] = vi.spyOn(console, m).mockImplementation(() => {});
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("client-logger: level -> console routing", () => {
  test.each([
    ["fatal", "error", "FATAL"],
    ["error", "error", "ERROR"],
    ["warn", "warn", "WARN"],
    ["info", "info", "INFO"],
    ["debug", "log", "DEBUG"],
    ["trace", "log", "TRACE"],
  ] as const)("%s -> console.%s with [%s] prefix", (level, method, tag) => {
    (logger as any)[level]("hello");
    expect(spies[method]).toHaveBeenCalledTimes(1);
    const args = spies[method].mock.calls[0];
    expect(args[0]).toMatch(PREFIX_RE(tag));
    expect(args.slice(1)).toEqual(["hello"]);
  });

  test("debug never uses console.debug (routed to console.log)", () => {
    logger.debug("d");
    expect(spies.debug).not.toHaveBeenCalled();
  });

  test("exactly one console call per log invocation", () => {
    logger.error({ a: 1 }, "x");
    const total = Object.values(spies).reduce((n: number, s: any) => n + s.mock.calls.length, 0);
    expect(total).toBe(1);
  });

  test("resolves console at call time, so spies installed after import are honoured", () => {
    spies.warn.mockRestore();
    const late = vi.spyOn(console, "warn").mockImplementation(() => {});
    logger.warn("late");
    expect(late).toHaveBeenCalledTimes(1);
  });

  test("timestamp reflects current time", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-02T03:04:05.006Z"));
    logger.info("t");
    expect(spies.info.mock.calls[0][0]).toBe("[2026-01-02T03:04:05.006Z] [INFO] [wedja]");
  });
});

describe("client-logger: argument shapes", () => {
  test("(context, msg) emits prefix, msg, context", () => {
    logger.info({ page: "dashboard" }, "Loaded");
    expect(spies.info.mock.calls[0].slice(1)).toEqual(["Loaded", { page: "dashboard" }]);
  });

  test("context only => empty message string", () => {
    logger.error({ status: 500 });
    expect(spies.error.mock.calls[0].slice(1)).toEqual(["", { status: 500 }]);
  });

  test("empty context on root logger => no third argument", () => {
    logger.info({}, "m");
    expect(spies.info.mock.calls[0]).toHaveLength(2);
  });

  test("string first arg ignores a second string argument", () => {
    (logger as any).info("first", "second");
    expect(spies.info.mock.calls[0].slice(1)).toEqual(["first"]);
  });

  test("Error objects in context are forwarded by reference", () => {
    const err = new Error("network");
    logger.error({ err }, "Failed to fetch data");
    expect(spies.error.mock.calls[0][2].err).toBe(err);
  });

  test("context passed to console is a copy; caller's object is not mutated", () => {
    const ctx = { a: 1 };
    createLogger("m").info(ctx, "x");
    const emitted = spies.info.mock.calls[0][2];
    expect(emitted).not.toBe(ctx);
    expect(ctx).toEqual({ a: 1 });
  });

  test("context is not redacted (no secret scrubbing is implemented)", () => {
    // Documents current behaviour — do not log tokens from client code.
    logger.info({ token: "sk-abc" }, "auth");
    expect(spies.info.mock.calls[0][2]).toEqual({ token: "sk-abc" });
  });
});

describe("client-logger: child / createLogger", () => {
  test("createLogger binds module, also on message-only calls", () => {
    createLogger("tenants-page").info("rendered");
    expect(spies.info.mock.calls[0].slice(1)).toEqual(["rendered", { module: "tenants-page" }]);
  });

  test("createLogger with empty module still emits the binding", () => {
    createLogger("").warn("w");
    expect(spies.warn.mock.calls[0][2]).toEqual({ module: "" });
  });

  test("per-call context overrides bound keys", () => {
    createLogger("a").info({ module: "b", x: 1 }, "m");
    expect(spies.info.mock.calls[0][2]).toEqual({ module: "b", x: 1 });
  });

  test("nested child merges bindings and inner wins", () => {
    createLogger("a").child({ req: "r1" }).child({ module: "c" }).debug("d");
    expect(spies.log.mock.calls[0][2]).toEqual({ module: "c", req: "r1" });
  });

  test("children are isolated from parent and siblings", () => {
    const parent = createLogger("p");
    const c1 = parent.child({ k: 1 });
    const c2 = parent.child({ k: 2 });
    c1.info("1");
    c2.info("2");
    parent.info("p");
    logger.info("root");
    expect(spies.info.mock.calls.map((c: any) => c[2])).toEqual([
      { module: "p", k: 1 },
      { module: "p", k: 2 },
      { module: "p" },
      undefined,
    ]);
  });

  test("mutating the object passed to child() after creation does not change bindings", () => {
    const bindings: Record<string, unknown> = { module: "orig" };
    const log = logger.child(bindings);
    bindings.module = "changed";
    log.info("x");
    expect(spies.info.mock.calls[0][2]).toEqual({ module: "orig" });
  });

  test("child exposes the full logger interface", () => {
    const c = createLogger("m");
    for (const k of ["fatal", "error", "warn", "info", "debug", "trace", "child"]) {
      expect(typeof (c as any)[k]).toBe("function");
    }
  });
});
