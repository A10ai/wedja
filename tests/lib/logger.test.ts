import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any */

// logger.ts imports "server-only", which throws outside a react-server bundle.
vi.mock("server-only", () => ({}));

// NOTE: pino is not a dependency of this repo, so createPinoInstance()'s
// require("pino") fails and every test here exercises the console fallback —
// which is what actually runs in this project today.

type LoggerModule = typeof import("@/lib/logger");

const spies: Record<string, any> = {};
const PREFIX_RE = (level: string) =>
  new RegExp(`^\\[\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z\\] \\[${level}\\] \\[wedja\\]$`);

async function load(env: Record<string, string | undefined> = {}): Promise<LoggerModule> {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as any);
  vi.resetModules();
  return import("@/lib/logger");
}

beforeEach(() => {
  for (const m of ["log", "debug", "info", "warn", "error"] as const) {
    spies[m] = vi.spyOn(console, m).mockImplementation(() => {});
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const totalConsoleCalls = () =>
  Object.values(spies).reduce((n: number, s: any) => n + s.mock.calls.length, 0);

describe("logger: level -> console routing", () => {
  test.each([
    ["fatal", "error", "FATAL"],
    ["error", "error", "ERROR"],
    ["warn", "warn", "WARN"],
    ["info", "info", "INFO"],
    ["debug", "debug", "DEBUG"],
    ["trace", "log", "TRACE"],
  ] as const)("%s -> console.%s with [%s] prefix", async (level, method, tag) => {
    const { logger } = await load({ LOG_LEVEL: "trace" });
    (logger as any)[level]("hello");
    expect(spies[method]).toHaveBeenCalledTimes(1);
    const [prefix, msg, ...rest] = spies[method].mock.calls[0];
    expect(prefix).toMatch(PREFIX_RE(tag));
    expect(msg).toBe("hello");
    expect(rest).toEqual([]);
  });

  test("prefix timestamp is the current time in ISO-8601 UTC", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-26T08:09:10.123Z"));
    const { logger } = await load();
    logger.info("x");
    expect(spies.info.mock.calls[0][0]).toBe("[2026-10-26T08:09:10.123Z] [INFO] [wedja]");
  });
});

describe("logger: argument shapes", () => {
  test("(context, msg) passes context as third arg", async () => {
    const { logger } = await load();
    logger.info({ cycleId: 7 }, "Brain cycle completed");
    expect(spies.info.mock.calls[0].slice(1)).toEqual(["Brain cycle completed", { cycleId: 7 }]);
  });

  test("empty context object is omitted from output", async () => {
    const { logger } = await load();
    logger.warn({}, "only msg");
    expect(spies.warn.mock.calls[0]).toHaveLength(2);
  });

  test("context without a message logs an empty-string message", async () => {
    const { logger } = await load();
    logger.error({ code: 500 });
    expect(spies.error.mock.calls[0].slice(1)).toEqual(["", { code: 500 }]);
  });

  test("Error instances in context are passed through by reference (not stringified)", async () => {
    const { logger } = await load();
    const err = new Error("boom");
    logger.error({ err }, "failed");
    expect(spies.error.mock.calls[0][2].err).toBe(err);
  });

  test("does not mutate the caller's context object", async () => {
    const { logger } = await load();
    const ctx = { a: 1 };
    logger.child({ module: "m" }).info(ctx, "x");
    expect(ctx).toEqual({ a: 1 });
  });

  test("methods stay bound when destructured off the proxy", async () => {
    const { logger } = await load();
    const { info } = logger;
    expect(() => info("detached")).not.toThrow();
    expect(spies.info).toHaveBeenCalledTimes(1);
  });

  test("unknown properties on the proxy resolve to undefined", async () => {
    const { logger } = await load();
    expect((logger as any).nope).toBeUndefined();
  });

  test("context is not redacted (no secret scrubbing is implemented)", async () => {
    // Documents current behaviour: callers must not pass secrets.
    const { logger } = await load();
    logger.info({ password: "hunter2" }, "login");
    expect(spies.info.mock.calls[0][2]).toEqual({ password: "hunter2" });
  });
});

describe("logger: child / createLogger", () => {
  test("createLogger binds module into every line", async () => {
    const { createLogger } = await load();
    const log = createLogger("ai-brain");
    log.info("tick");
    log.warn({ cycle: 2 }, "slow");
    expect(spies.info.mock.calls[0].slice(1)).toEqual(["tick", { module: "ai-brain" }]);
    expect(spies.warn.mock.calls[0].slice(1)).toEqual(["slow", { module: "ai-brain", cycle: 2 }]);
  });

  test("child routes every level to the matching console method", async () => {
    const { createLogger } = await load({ LOG_LEVEL: "trace" });
    const log = createLogger("m");
    log.fatal("f");
    log.error("e");
    log.debug("d");
    log.trace("t");
    expect(spies.error).toHaveBeenCalledTimes(2);
    expect(spies.debug).toHaveBeenCalledTimes(1);
    expect(spies.log).toHaveBeenCalledTimes(1);
    expect(spies.error.mock.calls[0][0]).toMatch(PREFIX_RE("FATAL"));
  });

  test("per-call context overrides bound keys", async () => {
    const { createLogger } = await load();
    createLogger("outer").info({ module: "inner" }, "x");
    expect(spies.info.mock.calls[0][2]).toEqual({ module: "inner" });
  });

  test("nested children merge bindings, inner wins", async () => {
    const { createLogger } = await load();
    const grand = createLogger("a").child({ req: "r1" }).child({ module: "b" });
    grand.info("x");
    expect(spies.info.mock.calls[0][2]).toEqual({ module: "b", req: "r1" });
  });

  test("child bindings do not leak into parent or siblings", async () => {
    const { logger } = await load();
    const a = logger.child({ module: "a" });
    logger.child({ module: "b" });
    a.child({ extra: 1 });
    logger.info("root");
    a.info("a");
    expect(spies.info.mock.calls[0]).toHaveLength(2);
    expect(spies.info.mock.calls[1][2]).toEqual({ module: "a" });
  });
});

describe("logger: level threshold", () => {
  test("LOG_LEVEL=debug lets debug through", async () => {
    const { logger } = await load({ LOG_LEVEL: "debug", NODE_ENV: "production" });
    logger.debug("d");
    expect(spies.debug).toHaveBeenCalledTimes(1);
  });

  // BUG: src/lib/logger.ts:44 + 71-107 — the console fallback (the only path in
  // this repo, since pino is not installed) never consults `level`; LOG_LEVEL
  // and the production default of "info" are computed and then ignored, so
  // debug/trace lines are always emitted.
  test.fails("LOG_LEVEL=warn suppresses info/debug/trace", async () => {
    const { logger } = await load({ LOG_LEVEL: "warn" });
    logger.info("i");
    logger.debug("d");
    logger.trace("t");
    expect(totalConsoleCalls()).toBe(0);
  });

  // BUG: same as above — production default level "info" is not enforced.
  test.fails("production default (info) suppresses debug", async () => {
    const { logger } = await load({ LOG_LEVEL: undefined, NODE_ENV: "production" });
    logger.debug("d");
    expect(spies.debug).not.toHaveBeenCalled();
  });

  // BUG: same root cause — child loggers also ignore the threshold.
  test.fails("child loggers respect LOG_LEVEL=error", async () => {
    const { createLogger } = await load({ LOG_LEVEL: "error" });
    createLogger("m").warn("w");
    expect(spies.warn).not.toHaveBeenCalled();
  });

  test("warn and above still emit when LOG_LEVEL=warn", async () => {
    const { logger } = await load({ LOG_LEVEL: "warn" });
    logger.warn("w");
    logger.error("e");
    logger.fatal("f");
    expect(spies.warn).toHaveBeenCalledTimes(1);
    expect(spies.error).toHaveBeenCalledTimes(2);
  });
});
