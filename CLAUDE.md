# Custis — The AI That Runs Your Property

## Project Overview

Build an AI-powered property management platform for Senzo Mall, Hurghada. Custis starts as a revenue protection tool that catches tenant underreporting, then evolves into an autonomous AI that manages the entire property.

**This is an internal tool first.** The owner manages Senzo Mall directly. No client sales cycle. Full data access. Build fast, prove value, then productise.

**Product Name:** Custis (from Latin "custos" — guardian)
**Tagline:** The AI that runs your property
**First Property:** Senzo Mall, Hurghada, Egypt

---

## Property Context

**Senzo Mall, Hurghada, Egypt**
- Largest shopping mall in Hurghada, 170,000 sqm, established 2009
- Safaga Road, 5 km from Hurghada International Airport
- Operating hours: 10AM–11PM weekdays, midnight weekends
- Daily footfall: 15,000+ visitors

**Key Tenants:**
- Anchor: Spinneys Hypermarket (5,000 sqm)
- Major brands: Adidas, Aldo, Timberland, LC Waikiki, DeFacto
- F&B: McDonald's, KFC, food court
- Entertainment: Kidzo indoor park

**Systems:**
- ERP: JD Edwards (Oracle) — financials, procurement, assets
- Security: Tens of IP cameras throughout
- Lease model: Tenants pay minimum rent OR percentage of sales (whichever is higher)

**The Problem:** Some tenants underreport sales to pay lower percentage rent. No way to verify without physically auditing. Custis fixes this.

---

## Tech Stack

- **Frontend:** Next.js 14 + TypeScript + Tailwind CSS
- **Database:** Supabase (PostgreSQL) + TimescaleDB extension for time-series (when needed)
- **AI/ML:** Python microservice for camera CV processing (YOLO + OpenCV)
- **LLM:** Anthropic Claude API for AI reasoning and chat
- **Auth:** Supabase Auth with RBAC (owner, manager, tenant, viewer)
- **Deployment:** Vercel (frontend) + Supabase Cloud (database)
- **ERP Integration:** JDE CSV/Excel imports initially, API later

**Why this stack:** Same as HospitAI — proven, fast to build, one developer can ship. Python only added for computer vision. Everything else is Next.js + Supabase.

---

## Database Schema

### Core Property
```
properties: id, name, address, city, country, total_area_sqm, floors, year_established, operating_hours, status, timezone, currency
zones: id, property_id, name, floor, area_sqm, type (retail/food/entertainment/service/parking/common), status
units: id, zone_id, property_id, name, unit_number, floor, area_sqm, status (occupied/vacant/maintenance), frontage_m, coordinates_json
```

### Tenants & Leases
```
tenants: id, name, brand_name, category (fashion/food/electronics/services/entertainment/grocery), brand_type (international/local/franchise), contact_name, contact_email, contact_phone, tax_id, status
leases: id, unit_id, tenant_id, property_id, start_date, end_date, min_rent_monthly_egp, percentage_rate, security_deposit_egp, escalation_rate, status (active/expired/terminated/pending), terms_json, notes
rent_transactions: id, lease_id, period_month, period_year, min_rent_due, percentage_rent_due, amount_due, amount_paid, payment_date, payment_method, status (paid/partial/overdue/waived), source
```

### Revenue Verification (THE KILLER FEATURE)
```
tenant_sales_reported: id, lease_id, tenant_id, period_month, period_year, reported_revenue_egp, submission_date, verified, verification_notes
footfall_readings: id, zone_id, unit_id, camera_id, timestamp, count_in, count_out, dwell_seconds, confidence
revenue_estimates: id, unit_id, tenant_id, period_month, period_year, estimated_revenue_egp, confidence_score, methodology, model_version, factors_json
discrepancies: id, unit_id, tenant_id, period_month, period_year, reported_revenue_egp, estimated_revenue_egp, variance_egp, variance_pct, confidence, status (flagged/investigating/resolved/dismissed), resolution_notes, flagged_at, resolved_at
```

### Operations
```
maintenance_tickets: id, property_id, zone_id, unit_id, title, description, category (hvac/electrical/plumbing/elevator/escalator/cleaning/structural/other), priority (low/normal/high/urgent/emergency), status (open/assigned/in_progress/on_hold/completed/cancelled), reported_by, assigned_to, estimated_cost_egp, actual_cost_egp, created_at, resolved_at
energy_readings: id, zone_id, timestamp, consumption_kwh, cost_egp, source
camera_feeds: id, property_id, name, location_description, zone_id, rtsp_url, status (active/offline/maintenance), resolution, angle_type (entrance/overhead/corridor)
```

### AI & Analytics
```
ai_decisions: id, property_id, type, category, context_json, recommendation, reasoning, confidence, human_action (pending/approved/modified/rejected), human_feedback, executed, created_at
ai_insights: id, property_id, type, severity (info/opportunity/warning/critical), title, message, impact_estimate, confidence, status (active/dismissed/actioned), created_at
footfall_daily: id, property_id, zone_id, unit_id, date, total_in, total_out, peak_hour, peak_count, avg_dwell_seconds
```

### System
```
staff: id, auth_user_id, property_id, name, email, phone, role (owner/manager/security/maintenance/viewer), department, status
audit_log: id, user_id, action, table_name, record_id, old_data_json, new_data_json, ip_address, created_at
notifications: id, staff_id, title, message, type, category, link, read, created_at
```

---

## Phase 1 — The Revenue Protector (8 weeks)

**Goal:** Identify and quantify tenant underreported revenue. This alone justifies the platform.

### Week 1–2: Foundation
- Project scaffolding (Next.js + Supabase)
- Database schema for Phase 1 tables
- Dashboard shell with Custis branding (dark/light theme from day one)
- Property, zone, unit CRUD
- Tenant and lease management with full details
- JDE data import (CSV upload for financials, rent, reported sales)
- Seed Senzo Mall data: all zones, units, tenants, active leases

### Week 3–4: Footfall Intelligence
- Camera feed registration (store RTSP URLs)
- Snapshot-based people counting (capture frame every 5-10 min, run YOLO)
- OR: manual footfall entry interface (from existing mall counters if cameras aren't ready)
- Footfall dashboard: hourly, daily, weekly trends per zone and per store
- Heatmap: which areas get the most traffic
- Peak/off-peak pattern detection

### Week 5–6: Revenue Verification Engine
- Revenue estimation model per retail category:
  - Fashion: footfall × 15-25% conversion × EGP 300-800 avg ticket
  - F&B: footfall × 40-60% conversion × EGP 100-250 avg ticket
  - Entertainment: footfall × 30-50% conversion × EGP 80-200 avg ticket
  - Grocery/Hypermarket: footfall × 60-80% conversion × EGP 200-500 avg ticket
  - Services: footfall × 20-35% conversion × EGP 150-400 avg ticket
- Cross-reference estimated vs reported tenant revenue
- Discrepancy flagging with confidence scores
- Discrepancy dashboard: ranked list of suspected underreporters
- Historical pattern analysis: "Tenant X consistently reports 30-40% below estimate"

### Week 7–8: AI Intelligence + Polish
- AI Command Centre: property health, revenue alerts, occupancy insights
- AI Chat: "Which tenants are likely underreporting?", "How is the food court performing?"
- Daily briefing: automated summary for the owner
- Notifications: revenue discrepancy alerts, overdue rent, maintenance issues
- Tenant performance cards: revenue per sqm, footfall attraction, payment history
- Reports: monthly revenue verification report, tenant performance report
- Mobile responsive

### Phase 1 Success Metric
**Identify and quantify underreported percentage rent.** If even one tenant is caught underreporting by EGP 50,000/month, the platform has paid for itself.

---

## Phase 2 — The Operations Brain (Months 5-8)

- Full JDE API integration (replace CSV imports)
- Maintenance ticketing with AI prediction
- Energy monitoring and optimization
- Tenant performance scoring and risk assessment (lease renewal prediction)
- Automated reporting (daily/weekly/monthly)
- AI chatbot for natural language queries
- Real-time footfall (upgrade from snapshots to video stream processing)
- Vendor management

---

## Phase 3 — The Autonomous Manager (Months 9-14)

- Supervised autonomy: AI proposes, owner approves
- Dynamic energy management based on real-time occupancy
- Predictive maintenance with auto-dispatch
- Demand forecasting and scenario modeling
- Automated tenant communications (payment reminders, violation notices)
- Lease renewal recommendations based on performance data
- Gradually increase AI decision authority

---

## Phase 4 — The AI That Runs Your Property (Months 15-24)

- Fine-tuned AI model on Senzo Mall data
- Full autonomous operations within policy boundaries
- Strategic recommendations (tenant mix, renovation, expansion)
- Multi-property deployment
- Conversational AI interface
- The AI learns from every human override
- Productise: sell Custis to other mall operators

---

## Brand & Design

### Colour Palette
```
// Dark theme
bg:         #0B0E18    // Deep background
card:       #111827    // Card surfaces
border:     #1F2937    // Borders
accent:     #F59E0B    // Amber/gold — authority, premium, guardian
accent-hover: #FBBF24
accent-muted: rgba(245, 158, 11, 0.12)

// Light theme
bg:         #F9FAFB
card:       #FFFFFF
border:     #E5E7EB
accent:     #D97706    // Darker amber for readability

// Status
success:    #10B981
warning:    #F59E0B
error:      #EF4444
info:       #3B82F6

// Text (dark)
primary:    #F9FAFB
secondary:  #9CA3AF
muted:      #6B7280

// Text (light)
primary:    #111827
secondary:  #4B5563
muted:      #9CA3AF
```

### Typography
- Headings: Inter (clean, professional)
- Body: Inter
- Monospace: JetBrains Mono (data, numbers)
- No decorative fonts

### Design Principles
1. **Professional, not flashy** — this is a management tool, not a marketing site
2. **Data-dense** — show more information per screen than HospitAI
3. **Amber/gold accent** — conveys authority, trust, premium (different from HospitAI's cyan)
4. **Dark AND light theme** from day one
5. **Arabic support** ready (RTL layout consideration)
6. **Mobile-first** for the owner's daily use

### Logo
Text wordmark: **Custis** with amber accent on the dot of the "i" or similar subtle mark.

---

## Monetary Values

- **Primary currency:** EGP (Egyptian Pounds)
- **Secondary:** USD conversion for reporting
- **Exchange rate:** Store and update regularly
- All financial displays show EGP by default with USD toggle

---

## Key Differences from HospitAI

| Aspect | HospitAI | Custis |
|--------|----------|--------|
| Property type | Hotel (aparthotel) | Commercial (shopping mall) |
| Revenue model | Room bookings | Tenant leases + percentage rent |
| Killer feature | AI cross-system automation | Revenue verification (catch underreporting) |
| Users | Hotel staff | Property owner/manager |
| Guests vs Tenants | Short-stay guests | Long-term commercial tenants |
| Accent colour | Cyan (#22D3EE) | Amber (#F59E0B) |
| CV/Camera | Not used | Core feature (footfall counting) |
| ERP integration | None | JD Edwards |

---

## Implementation Notes

1. **Start with Phase 1 only.** Do not build Phase 2-4 features yet.
2. **Revenue verification is priority #1.** Everything else serves this.
3. **Work with imperfect data.** Cameras won't be perfect. Estimates have confidence scores.
4. **Every AI output has confidence + reasoning.** No black boxes.
5. **Audit log everything.** Every data change, every AI decision, every human override.
6. **Design for multi-property** (property_id on every table) but don't build multi-property UI yet.
7. **JDE starts with CSV import.** Don't block on API integration.
8. **Camera CV is a separate Python service.** Dashboard is Next.js + Supabase.
9. **All monetary values in EGP** with USD conversion option.
10. **Light/dark theme from day one.**
