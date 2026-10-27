# Wedja (Custis) — Deep Test Report

**Date:** 26 October 2026 · **Branch:** `claude/wedja-deep-test-2rlwng`

## 1. Summary

| Check | Before | After |
|---|---|---|
| Unit/API test files | 14 | 32 |
| Tests | 212 | 824 (791 pass + 33 `test.fails` documenting known bugs) |
| Lib modules with tests | 13 / 27 | 27 / 28 (+ new `import-utils`) |
| API routes with an auth contract test | 0 | 37 / 37 protected routes |
| `tsc --noEmit` | 0 errors | 0 errors |
| `next lint` | 87 warnings, 0 errors | 87 warnings, 0 errors |
| `next build` | pass | pass |

Run: `npm test`. Every `test.fails` carries a `// BUG:` comment and flips to a normal failure once the bug is fixed (remove the `.fails` then).

Note: `next build` type-checks `tests/`, so a type error in a test file breaks the deploy.

## 2. Bugs found and fixed in this pass

| # | Where | Bug | Impact |
|---|---|---|---|
| 1 | `src/lib/api-auth.ts` | Session cookie decoded with `atob`, but `@supabase/ssr` 0.9 writes base64url (`-`/`_`) → decode fails → 401 | Logged-in users randomly rejected by every API route |
| 2 | `src/lib/api-auth.ts` | Chunked session cookies (`.0`, `.1`) not reassembled; PKCE `-code-verifier` cookie could be picked as the session | Large sessions always 401 |
| 3 | `src/app/api/v1/import` (JDE) | Fuzzy tenant matcher substring-matched short keys (`hm` for H&M matches "Mohammed Ahmed") | Revenue booked to the wrong tenant — corrupts revenue verification |
| 4 | `src/app/api/v1/import` (sales/rent) | Month 0/13, 2-digit years, `NaN` and negative amounts inserted | Bad data in `tenant_sales_reported` / `rent_transactions` |
| 5 | `src/app/api/v1/tenants` | Search term interpolated into a PostgREST `or()` filter unescaped | Filter injection |
| 6 | `ai/predictions`, `ai/events` | `days`, `months`, `limit` unbounded / NaN | Expensive requests, NaN forecasts |

Parsers moved to `src/lib/import-utils.ts` (pure, unit tested). New tests fail on the old code and pass on the fix.

## 3. Critical findings NOT fixed (need a decision / migration)

> **Update 27 Oct 2026:** all four are fixed on this branch — migration `00018_audit_columns_and_broadcast_notifications.sql` adds the columns `logAudit` writes and makes `notifications.staff_id` nullable (NULL = broadcast) with per-person read marks in `notification_reads`; `logAudit` logs insert errors and stores non-UUID user ids as null; `markAllRead` / `markRead` / `getUnreadCount` / `getNotifications` are scoped to the caller; notify handlers report the insert result; the console logger honours `LOG_LEVEL`. The matching `test.fails` cases are now ordinary tests.

1. **Audit log is not being written.** `logAudit` inserts `category`, `description`, `user_email`, `resource_*`, `metadata` — none exist on `audit_log` (migration 00001) — and writes `user_id: "system"` into a UUID column. It also ignores the returned `{ error }`, so the failure is silent. Violates "audit log everything".
2. **Notifications insert `staff_id: null`** but the column is `NOT NULL` → all system notifications (underreporting alerts, overdue rent, lease expiry) fail. Event-bus handlers report `success: true` regardless.
3. **`markAllRead` has no staff filter** — marks every user's notifications as read.
4. **Logger ignores `LOG_LEVEL`** — pino is not installed, so the console fallback always runs and never applies the level (debug logs in production).

## 4. Known bugs captured as `test.fails` (33)

**AI brain / learning / engine / chat (13)**
- `ai-brain.ts:149` `interval_minutes: NaN` accepted.
- `ai-brain.ts:515` Claude confidence `0` becomes 50 (`|| 50`); out-of-range confidences (150, −20) not clamped.
- `learning-engine.ts:804` confidence decay compounds every run (−5/day instead of −5/month).
- `learning-engine.ts:862` patterns matched by title containing live numbers → duplicates.
- `learning-engine.ts:827` a pattern detected this cycle is immediately "confirmed".
- `learning-engine.ts:641` weekday energy 0 → "Infinity% more energy on weekends".
- `ai-engine.ts:441` posting-time insight title hard-coded to "Thursday 7-9 PM".
- `ai-chat.ts:530` "preventive maintenance" routed to events ("prevent" ⊃ "event").
- `ai-chat.ts:737` tenant names substring-matched ("maximize" → tenant "Max").
- `ai-chat.ts:2156` "contract alerts" never reaches `getContractAlerts`.
- `ai-chat.ts:841` health-score reply prints a non-existent `label` field.
- `ai-chat.ts:721` trailing "?" kept in tenant search ("Tell me about KFC?").

**Automations / marketing / social (13)**
- `automations-engine.ts:173` `uniqueMonths` always 1 → zone average inflated → wrong "Do not renew" recommendations.
- `automations-engine.ts:1029` top-10 and bottom-10 overlap with < 20 tenants (best tenant flagged for replacement).
- `marketing-engine.ts:301` / `social-engine.ts:412` seasonal dates only resolved in the current year (January seasons invisible in December).
- `marketing-engine.ts:159` Dec–Feb seasons mis-placed; ended seasons shown as "currently active" for 7 days.
- `marketing-engine.ts:421` ROI is `null` when cost or revenue impact is 0.
- `marketing-engine.ts:615` event footfall boost divides by days vs rows → 100% boost on flat traffic with 2 zones.
- `social-engine.ts:761/728/739` caption `char_count` hard-coded, X 280-char limit not applied, `#Deals` added for "Ideal".
- `social-engine.ts:852/867` divide-by-zero → "Infinityx" / "Infinity%" in insights.

**Infra (7)**
- `audit.ts:23` Supabase `{ error }` ignored; `audit.ts:68` `byCategory` on plain `{}` ("toString" category).
- `event-bus.ts:330` notify handlers report success when `createNotification` fails; `undefined` tenant names in result messages.
- `logger.ts` level not applied (3 cases).

## 5. Other observations (current behaviour, not asserted as bugs)
- Empty database scores 75/100 health (no rent = 100% collected, no units = fully occupied).
- Occupancy defined three different ways across `ai-brain`, `ai-engine`, `ai-chat`; dead-zone threshold 20% vs 40%.
- Claude-sourced brain decisions have no event type, so they never auto-execute.
- `getAuditStats` counts categories from an unbounded select (PostgREST caps at 1000 rows).
- `generateCaptions` ignores `language`; `#Ramadan2026` hard-coded.
- No secret redaction in either logger.

## 6. New test infrastructure
- `tests/api/auth-guard.test.ts` — discovers every `route.ts` and asserts each exported method returns 401 before touching the DB (new routes are covered automatically).
- `tests/api/routes.test.ts` — import (CSV, Excel, JDE), tenant search, query-param clamping.
- `tests/lib/helpers/supabase-mock.ts` — extended with `errors`, `counts`, `sequences`, `throws`, full payload capture (backward compatible).
- `tests/lib/helpers/scripted-supabase.ts`, `routing-supabase-mock.ts` — filter-aware mocks for multi-query engines.
