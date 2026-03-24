#!/usr/bin/env python3
"""Generate Wedja AI Platform Status Report PDF."""

from fpdf import FPDF
import os

# --- Constants ---
AMBER = (245, 158, 11)
DARK = (30, 30, 30)
GRAY_TEXT = (80, 80, 80)
WHITE = (255, 255, 255)
LIGHT_AMBER = (255, 247, 230)
ROW_ALT = (248, 248, 248)
BORDER_GRAY = (220, 220, 220)
OUTPUT = "/Users/ai10/Desktop/HospitAI/Wedja-Status-Report.pdf"


class StatusReport(FPDF):
    def __init__(self):
        super().__init__()
        self.set_auto_page_break(auto=True, margin=25)

    def header(self):
        if self.page_no() == 1:
            return
        # Thin amber line at top
        self.set_draw_color(*AMBER)
        self.set_line_width(0.6)
        self.line(15, 10, self.w - 15, 10)
        self.set_font("Helvetica", "B", 8)
        self.set_text_color(*GRAY_TEXT)
        self.set_xy(15, 11)
        self.cell(0, 5, "Wedja AI - Platform Status Report", ln=True)
        self.ln(4)

    def footer(self):
        self.set_y(-18)
        self.set_draw_color(*BORDER_GRAY)
        self.set_line_width(0.3)
        self.line(15, self.get_y(), self.w - 15, self.get_y())
        self.ln(2)
        self.set_font("Helvetica", "", 7.5)
        self.set_text_color(*GRAY_TEXT)
        self.cell(0, 5, "wedja.ai", align="L")
        self.set_x(15)
        self.cell(0, 5, f"Page {self.page_no()}/{{nb}}", align="R")

    # --- Helpers ---
    def section_header(self, text):
        self.ln(4)
        if self.get_y() > 260:
            self.add_page()
        self.set_font("Helvetica", "B", 16)
        self.set_text_color(*AMBER)
        self.cell(0, 10, text, ln=True)
        # Underline
        self.set_draw_color(*AMBER)
        self.set_line_width(0.8)
        y = self.get_y()
        self.line(15, y, self.w - 15, y)
        self.ln(4)

    def sub_header(self, text):
        if self.get_y() > 262:
            self.add_page()
        self.ln(2)
        self.set_font("Helvetica", "B", 12)
        self.set_text_color(*DARK)
        self.cell(0, 8, text, ln=True)
        self.ln(1)

    def body_text(self, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*GRAY_TEXT)
        self.multi_cell(0, 5.5, text)

    def bullet(self, text, indent=20):
        if self.get_y() > 272:
            self.add_page()
        x = self.get_x()
        self.set_x(indent)
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*GRAY_TEXT)
        # Amber bullet dot
        self.set_fill_color(*AMBER)
        self.circle(indent + 1, self.get_y() + 2.5, 1.2, style="F")
        self.set_x(indent + 6)
        self.multi_cell(self.w - indent - 21, 5.5, text)
        self.ln(0.5)

    def circle(self, x, y, r, style="D"):
        """Draw a filled circle (bullet point)."""
        import math
        k = 0.551784
        cx, cy = x, y
        self._out(f'{(cx - r) * self.k:.2f} {(self.h - cy) * self.k:.2f} m')
        self._out(f'{(cx - r) * self.k:.2f} {(self.h - (cy - r * k)) * self.k:.2f} '
                  f'{(cx - r * k) * self.k:.2f} {(self.h - (cy - r)) * self.k:.2f} '
                  f'{cx * self.k:.2f} {(self.h - (cy - r)) * self.k:.2f} c')
        self._out(f'{(cx + r * k) * self.k:.2f} {(self.h - (cy - r)) * self.k:.2f} '
                  f'{(cx + r) * self.k:.2f} {(self.h - (cy - r * k)) * self.k:.2f} '
                  f'{(cx + r) * self.k:.2f} {(self.h - cy) * self.k:.2f} c')
        self._out(f'{(cx + r) * self.k:.2f} {(self.h - (cy + r * k)) * self.k:.2f} '
                  f'{(cx + r * k) * self.k:.2f} {(self.h - (cy + r)) * self.k:.2f} '
                  f'{cx * self.k:.2f} {(self.h - (cy + r)) * self.k:.2f} c')
        self._out(f'{(cx - r * k) * self.k:.2f} {(self.h - (cy + r)) * self.k:.2f} '
                  f'{(cx - r) * self.k:.2f} {(self.h - (cy + r * k)) * self.k:.2f} '
                  f'{(cx - r) * self.k:.2f} {(self.h - cy) * self.k:.2f} c')
        if "F" in style.upper():
            self._out("f")
        else:
            self._out("S")

    def stat_box(self, x, y, w, h, number, label):
        """Draw a stat highlight box."""
        self.set_fill_color(*LIGHT_AMBER)
        self.set_draw_color(*AMBER)
        self.set_line_width(0.4)
        self.rect(x, y, w, h, "DF")
        # Number
        self.set_font("Helvetica", "B", 18)
        self.set_text_color(*AMBER)
        self.set_xy(x, y + 4)
        self.cell(w, 10, number, align="C")
        # Label
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*GRAY_TEXT)
        self.set_xy(x, y + 15)
        self.cell(w, 6, label, align="C")

    def table(self, headers, rows, col_widths=None):
        """Draw a professional table with alternating row shading."""
        if self.get_y() > 240:
            self.add_page()
        available = self.w - 30
        if col_widths is None:
            col_widths = [available / len(headers)] * len(headers)
        else:
            total = sum(col_widths)
            col_widths = [w / total * available for w in col_widths]

        x_start = 15

        # Header row
        self.set_fill_color(*AMBER)
        self.set_text_color(*WHITE)
        self.set_font("Helvetica", "B", 9.5)
        self.set_draw_color(*AMBER)
        self.set_line_width(0.1)
        x = x_start
        for i, h in enumerate(headers):
            self.set_xy(x, self.get_y())
            self.cell(col_widths[i], 8, f"  {h}", border=0, fill=True)
            x += col_widths[i]
        self.ln(8)

        # Data rows
        self.set_font("Helvetica", "", 9.5)
        for row_idx, row in enumerate(rows):
            if self.get_y() > 268:
                self.add_page()
            if row_idx % 2 == 0:
                self.set_fill_color(*WHITE)
            else:
                self.set_fill_color(*ROW_ALT)
            self.set_text_color(*DARK)
            self.set_draw_color(*BORDER_GRAY)

            # Calculate row height based on content
            x = x_start
            for i, cell_text in enumerate(row):
                self.set_xy(x, self.get_y())
                self.cell(col_widths[i], 7.5, f"  {cell_text}", border="B", fill=True)
                x += col_widths[i]
            self.ln(7.5)

        self.ln(3)


def build_report():
    pdf = StatusReport()
    pdf.alias_nb_pages()

    # =================== COVER PAGE ===================
    pdf.add_page()

    # Large amber block at top
    pdf.set_fill_color(*AMBER)
    pdf.rect(0, 0, 210, 100, "F")

    # Title on amber
    pdf.set_font("Helvetica", "B", 36)
    pdf.set_text_color(*WHITE)
    pdf.set_xy(20, 25)
    pdf.cell(0, 15, "Wedja AI")
    pdf.set_font("Helvetica", "", 20)
    pdf.set_xy(20, 45)
    pdf.cell(0, 10, "Platform Status Report")

    # Thin line separator
    pdf.set_draw_color(*WHITE)
    pdf.set_line_width(0.5)
    pdf.line(20, 62, 100, 62)

    # Meta info on amber
    pdf.set_font("Helvetica", "", 12)
    pdf.set_xy(20, 68)
    pdf.cell(0, 7, "24 March 2026")
    pdf.set_xy(20, 76)
    pdf.cell(0, 7, "app.wedja.ai")
    pdf.set_xy(20, 84)
    pdf.cell(0, 7, "Senzo Mall, Hurghada, Egypt")

    # Stat boxes below amber block
    box_y = 115
    box_w = 40
    box_h = 28
    gap = 5
    start_x = 15
    stats = [
        ("53,000+", "Lines of Code"),
        ("33", "Dashboard Pages"),
        ("37", "API Routes"),
        ("24", "Engine Modules"),
    ]
    for i, (num, label) in enumerate(stats):
        pdf.stat_box(start_x + i * (box_w + gap), box_y, box_w, box_h, num, label)

    box_y2 = 150
    stats2 = [
        ("44", "Database Tables"),
        ("16", "Chart Pages"),
        ("166", "Tenants"),
        ("1,618", "Transactions"),
    ]
    for i, (num, label) in enumerate(stats2):
        pdf.stat_box(start_x + i * (box_w + gap), box_y2, box_w, box_h, num, label)

    # Platform rating highlight
    pdf.set_xy(15, 195)
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(*DARK)
    pdf.cell(0, 10, "Overall Platform Rating")
    pdf.set_xy(15, 207)
    pdf.set_font("Helvetica", "B", 48)
    pdf.set_text_color(*AMBER)
    pdf.cell(40, 20, "8.2")
    pdf.set_font("Helvetica", "", 20)
    pdf.set_text_color(*GRAY_TEXT)
    pdf.cell(30, 20, "/ 10")

    # Deployed info
    pdf.set_xy(15, 240)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*GRAY_TEXT)
    pdf.multi_cell(0, 5.5,
        "Deployed on Vercel with Supabase cloud database (AWS eu-west-1).\n"
        "Authentication with staff roles. Dark and light theme. Mobile responsive.")

    # =================== PAGE 2: WHAT'S BUILT ===================
    pdf.add_page()
    pdf.section_header("What's Built")

    # --- Core Property Management ---
    pdf.sub_header("Core Property Management")
    for item in [
        "Property, 8 zones, 166 units, 166 tenants with contact info",
        "Leases, contracts, rent transactions (real JDE data)",
        "Tenant detail pages with full profiles",
    ]:
        pdf.bullet(item)

    # --- Revenue & Financial ---
    pdf.sub_header("Revenue & Financial")
    for item in [
        "Revenue tracking (collected, outstanding, overdue)",
        "Percentage rent analysis (base vs % rent, premium tracking)",
        "Discrepancy detection (79 flagged tenants, variance analysis)",
        "Finance module (P&L, budgets, expenses, cash flow charts)",
        "Revenue estimation and verification engine",
    ]:
        pdf.bullet(item)

    # --- AI Intelligence ---
    pdf.sub_header("AI Intelligence (8 modules)")
    ai_modules = [
        ("AI Brain", "Claude API reasoning, supervised/autonomous modes"),
        ("AI Command Centre", "Health score, cross-data insights"),
        ("AI Predictions", "ML footfall + revenue forecasting"),
        ("Anomaly Detection", "24/7 AI watchdog"),
        ("Smart Automations", "7 automated rules"),
        ("AI Scheduler", "Autonomous thinking cycles"),
        ("Event Bus", "Cross-system intelligence"),
        ("AI Learning", "Pattern discovery, parameter calibration"),
    ]
    for name, desc in ai_modules:
        pdf.bullet(f"{name}  - {desc}")

    # --- Operations ---
    pdf.sub_header("Operations")
    for item in [
        "Footfall analytics (30 days data, hourly/daily/zone breakdown)",
        "CCTV management (40 cameras registered, store conversion tracking)",
        "Maintenance ticketing (30 tickets with status/category tracking)",
        "Energy monitoring (zone breakdown, efficiency scoring, AI recommendations)",
        "Mall heatmap (U-shaped layout, 122 tenants mapped)",
    ]:
        pdf.bullet(item)

    # --- Business ---
    pdf.sub_header("Business")
    for item in [
        "Marketing campaigns and events",
        "Social media management (4 accounts, 65 posts)",
        "Reports engine (6 report types, CSV export)",
        "JDE Data Import (drag-and-drop Excel/CSV uploader)",
    ]:
        pdf.bullet(item)

    # --- New Features ---
    pdf.sub_header("New Features (24 March 2026)")
    for item in [
        "Daily Briefing  - 10-module morning command centre for the owner",
        "Tenant Communications  - payment reminders, lease renewals, 5 message templates",
        "Real-time Dashboard  - live Supabase subscriptions, auto-refresh",
        "JDE Data Import  - drag-and-drop Excel/CSV file uploader",
        "Recharts graphs added to all 16 data pages",
        "Sidebar reorganized into 5 grouped sections",
    ]:
        pdf.bullet(item)

    # --- Infrastructure ---
    pdf.sub_header("Infrastructure")
    for item in [
        "Supabase cloud database (AWS eu-west-1)",
        "Vercel deployment with auto-deploy from GitHub",
        "Authentication with staff roles",
        "Dark and light theme",
        "Mobile responsive design",
        "CV Service built (Python/YOLO)  - ready for deployment",
    ]:
        pdf.bullet(item)

    # =================== PAGE: WHAT'S MISSING ===================
    pdf.add_page()
    pdf.section_header("What's Missing")

    pdf.sub_header("Waiting on IT Team")
    for item in [
        "Live camera connection  - need RTSP credentials and VPN access",
        "JDE API integration  - need API access or sample export files",
        "Firewall whitelist  - office PCs currently blocked from accessing the platform",
    ]:
        pdf.bullet(item)

    pdf.sub_header("Features to Build")
    pdf.table(
        ["Feature", "Effort", "Impact"],
        [
            ["WhatsApp/Email message delivery", "Medium", "High"],
            ["Tenant Portal (tenant login)", "Large", "High"],
            ["Automated scheduled reports", "Medium", "Medium"],
            ["Vendor management", "Medium", "Medium"],
            ["Multi-property support", "Large", "High"],
            ["Mobile PWA with push notifications", "Medium", "High"],
            ["AI Autonomy Mode (batch approve)", "Medium", "Medium"],
            ["Demand forecasting", "Medium", "Medium"],
            ["Lease negotiation assistant", "Medium", "Medium"],
            ["Role-based access on frontend", "Small", "Medium"],
            ["Arabic/RTL support", "Medium", "Medium"],
        ],
        col_widths=[5, 1.5, 1.5],
    )

    pdf.sub_header("Camera Pipeline (pending IT)")
    for item in [
        "Deploy CV service on on-site server",
        "Connect to real RTSP camera streams",
        "Real-time footfall counting",
        "Store-level visitor tracking for revenue verification",
    ]:
        pdf.bullet(item)

    pdf.sub_header("JDE Integration (pending IT)")
    for item in [
        "Parse real JDE export formats",
        "Scheduled auto-import",
        "Direct JDE REST API connection (Phase 2)",
    ]:
        pdf.bullet(item)

    # =================== PAGE: PLATFORM RATING ===================
    pdf.add_page()
    pdf.section_header("Platform Rating: 8.2 / 10")

    pdf.sub_header("Score Breakdown")
    pdf.table(
        ["Category", "Score"],
        [
            ["Core PMS", "9 / 10"],
            ["Revenue Engine", "9 / 10"],
            ["AI Intelligence", "8 / 10"],
            ["Dashboard & UX", "9 / 10"],
            ["Daily Briefing", "9 / 10"],
            ["Finance", "8 / 10"],
            ["Energy", "8 / 10"],
            ["Footfall & CV", "7 / 10"],
            ["CCTV / Security", "7 / 10"],
            ["Communications", "7 / 10"],
            ["Marketing / Social", "7 / 10"],
            ["Deployment", "8 / 10"],
            ["Auth & Security", "6 / 10"],
            ["Mobile", "6 / 10"],
        ],
        col_widths=[4, 1.5],
    )

    pdf.sub_header("Gap to 9+")
    gap_items = [
        "Live camera feeds (waiting on IT)",
        "Real message delivery (WhatsApp/email API)",
        "Tenant portal (separate login for tenants)",
        "Role-based access enforcement on frontend",
    ]
    for i, item in enumerate(gap_items, 1):
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(*GRAY_TEXT)
        pdf.set_x(20)
        # Number in amber
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(*AMBER)
        pdf.cell(8, 6, f"{i}.")
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(*DARK)
        pdf.cell(0, 6, item, ln=True)

    # --- Signature block ---
    pdf.ln(15)
    pdf.set_draw_color(*BORDER_GRAY)
    pdf.set_line_width(0.3)
    pdf.line(15, pdf.get_y(), pdf.w - 15, pdf.get_y())
    pdf.ln(6)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*DARK)
    pdf.cell(0, 6, "Prepared by:  Wedja Development Team", ln=True)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*GRAY_TEXT)
    pdf.cell(0, 6, "Contact:  ibrahim@abuashara.com", ln=True)
    pdf.cell(0, 6, "Platform:  app.wedja.ai", ln=True)

    # --- Output ---
    pdf.output(OUTPUT)
    print(f"PDF generated: {OUTPUT}")
    print(f"Pages: {pdf.page_no()}")


if __name__ == "__main__":
    build_report()
