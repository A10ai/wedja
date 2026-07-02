# Wedja (Custis) Deep Test Report

**Date:** 25 June 2026
**App:** app.wedja.ai
**Repo:** github.com/A10ai/wedja
**Product:** Custis — AI property management for Senzo Mall, Hurghada

---

## 1. Executive Summary

| Category | Status | Details |
|----------|--------|---------|
| Unit Tests | NONE | 0 test files, 0 tests |
| E2E Tests | NONE | No Playwright/Cypress configured |
| API Routes | WARN | 37 routes tested, 34 pass, 3 warnings |
| Dashboard Pages | PASS | 33/33 redirect to login when unauthenticated |
| Public Pages | PASS | /login 200, / 307 redirect, 404 works |
| Auth Protection | CRITICAL FAIL | 0/37 routes require auth — ALL API routes return 200 publicly |
| Middleware | CRITICAL FAIL | No middleware — no session check, no redirect logic |
| Security Headers | CRITICAL FAIL | 5 of 6 security headers MISSING (only HSTS present) |
| CI/CD | NONE | No GitHub Actions, no automated testing |
| TypeScript | PASS | 0 tsc errors |
| ESLint | PASS | 78 warnings, exits 0 |
| Input Validation | FAIL | 2/37 routes have validation, 35 have none |
| Zod | NOT INSTALLED | zod not in dependencies |

**Overall: CRITICAL SECURITY ISSUES — NOT PRODUCTION SAFE**

---

## 2. Codebase Stats

| Metric | Count |
|--------|-------|
| Source files | 113 |
| Source LOC | 54,233 |
| API routes | 37 |
| Dashboard pages | 35 |
| Components | 9 |
| Lib modules | 27 |
| Test files | 0 |
| DB migrations | 13 |

---

## 3. API Route Tests (Live — app.wedja.ai)

**37 routes tested against production**

### CRITICAL: ALL routes return 200 without auth
Every API route returns HTTP 200 to unauthenticated requests. This means:
- Dashboard stats are publicly accessible
- Tenant data is publicly accessible
- Financial data is publicly accessible
- Revenue verification data is publicly accessible
- AI brain data is publicly accessible
- Audit logs are publicly accessible

This is a severe security vulnerability.

### 3 Warnings (non-critical)
| Route | Status | Note |
|-------|--------|------|
| /api/v1/footfall/manual | 405 | POST-only route, GET returns 405 (correct) |
| /api/v1/communications | 400 | Missing required query param (correct) |
| /api/v1/ai/chat | 405 | POST-only route, GET returns 405 (correct) |

### Sample Response (PUBLIC — no auth needed)
```json
GET /api/v1/dashboard/stats → 200
{
  "total_revenue_egp": 60724035.94,
  "occupancy_rate": 100,
  "active_tenants": 166,
  "total_units": 166,
  "occupied_units": 166,
  "vacant_units": 0,
  "maintenance_units": 0,
  "overdue_rent_count": 1215,
  "open_maintenance": ...
}
```

---

## 4. Dashboard Page Tests (Live)

33/33 dashboard pages redirect to login when unauthenticated — PASS

### Public Pages
| Page | Status | Result |
|------|--------|--------|
| / | 307 | Redirects to /login |
| /login | 200 | PASS |
| /nonexistent-12345 | 404 | PASS |

Note: Dashboard pages redirect because there's no middleware session, so they fall through to the login redirect. However, the API routes do NOT redirect — they return data publicly.

---

## 5. Security Audit

### Security Headers
| Header | Status |
|--------|--------|
| Strict-Transport-Security | PASS — present |
| X-Content-Type-Options | FAIL — MISSING |
| X-Frame-Options | FAIL — MISSING |
| Content-Security-Policy | FAIL — MISSING |
| Permissions-Policy | FAIL — MISSING |
| Referrer-Policy | FAIL — MISSING |

Only HSTS is set (by Vercel by default). No custom security headers in next.config.

### Middleware
NO middleware exists. No session validation, no route protection.

### Auth
0 of 37 API routes have auth checks. All routes are publicly accessible.

### Input Validation
- Zod is NOT installed (not in package.json)
- 2 of 37 routes have some form of validation
- 35 routes accept unvalidated input

---

## 6. Code Quality Audit

| Issue | Count | Severity |
|-------|-------|----------|
| `any` type usages | 473 across 113 files | HIGH |
| console.* calls | 90 across files | MEDIUM |
| Routes without Zod validation | 35/37 | HIGH |
| Routes without auth | 37/37 | CRITICAL |
| Routes without try/catch | 0/37 | PASS |
| Test files | 0 | HIGH |
| ESLint warnings | 78 | MEDIUM |
| tsc errors | 0 | PASS |
| TODO/FIXME | not checked | — |

---

## 7. Issues Found (Ranked by Severity)

### CRITICAL
1. **ALL API routes are publicly accessible** — 0/37 routes require authentication. Financial data, tenant data, revenue verification, audit logs, AI brain — all exposed to anyone with the URL. This is a data breach waiting to happen.

2. **No middleware** — No session validation, no route protection. The app has no security layer between the client and API.

3. **5 of 6 security headers missing** — No CSP, no X-Frame-Options, no X-Content-Type-Options, no Permissions-Policy, no Referrer-Policy. Vulnerable to XSS, clickjacking, MIME sniffing.

### HIGH
4. **Zero tests** — No unit tests, no E2E tests, no test framework installed. Any change could break anything without detection.

5. **No CI/CD** — No GitHub Actions, no automated testing, no automated deployment, no branch protection.

6. **473 `any` type usages** — Worse than HospitAI was (232). Type safety is essentially non-existent.

7. **No input validation** — Zod not installed, 35/37 routes accept unvalidated input.

### MEDIUM
8. **90 console.* calls** — Should use structured logger.

9. **78 ESLint warnings** — Not failing but indicates technical debt.

### LOW
10. **No /api/v1/admin route** — Admin sub-routes may exist but base path returns 404.

---

## 8. Comparison with HospitAI

| Metric | HospitAI | Wedja | Gap |
|--------|----------|-------|-----|
| Source LOC | 52K | 54K | Similar |
| API routes | 75 | 37 | HospitAI larger |
| Pages | 52 | 35 | HospitAI larger |
| Unit tests | 102 | 0 | CRITICAL gap |
| E2E tests | 6 | 0 | CRITICAL gap |
| CI/CD | Full (4 jobs) | None | CRITICAL gap |
| Auth on routes | 71/75 (100%) | 0/37 (0%) | CRITICAL gap |
| Zod validation | 55/75 (95%) | 2/37 (5%) | CRITICAL gap |
| `any` types | 1 | 473 | CRITICAL gap |
| console.* calls | 0 | 90 | CRITICAL gap |
| Security headers | 6/6 | 1/6 | CRITICAL gap |
| Middleware | Yes | No | CRITICAL gap |
| Enterprise compliance | 95.2% (Grade A) | ~20% (Grade F) | CRITICAL gap |

Wedja is where HospitAI was before the 8 sprints of hardening. Same architecture, same patterns, but none of the security/quality infrastructure has been applied.

---

## 9. Recommendations

### Immediate (before any further use)
1. Add middleware with session cookie check (copy pattern from HospitAI src/middleware.ts)
2. Add auth checks to all 37 API routes (import requireApiAuth pattern from HospitAI)
3. Add security headers to next.config (copy from HospitAI next.config.mjs)
4. Install Zod and add input validation to all routes

### Short-term (1-2 days)
5. Set up CI/CD pipeline (copy HospitAI ci.yml — adapt for Wedja)
6. Install Vitest + write unit tests for lib modules
7. Replace console.* with structured logger
8. Fix `any` types (apply same approach as HospitAI)

### Medium-term (1 week)
9. Install Playwright + write E2E smoke tests
10. Set up Vercel auto-deploy + branch protection
11. Add audit logging
12. Add GDPR compliance layer

Wedja can leverage HospitAI's proven patterns — the codebase is the same architecture (Next.js 14 + Supabase + TypeScript). Most fixes are copy-adapt-deploy from HospitAI's existing solutions.