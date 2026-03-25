#!/usr/bin/env python3
"""Generate Wedja FC Data Requirements PDF."""

from fpdf import FPDF

OUTPUT = "/Users/ai10/Desktop/HospitAI/Wedja-FC-Data-Requirements.pdf"

# Brand colors
AMBER = (245, 158, 11)
DARK = (30, 30, 30)
GRAY_TEXT = (80, 80, 80)
WHITE = (255, 255, 255)
ROW_ALT = (252, 249, 240)
ROW_EVEN = (255, 255, 255)
LIGHT_AMBER = (255, 247, 230)
HEADER_BG = (245, 158, 11)
TABLE_HEADER = (55, 55, 55)


class WedjaDoc(FPDF):
    def __init__(self):
        super().__init__("P", "mm", "A4")
        self.set_auto_page_break(auto=True, margin=25)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(160, 160, 160)
        self.line(15, self.h - 20, self.w - 15, self.h - 20)
        self.cell(0, 10, "wedja.ai", align="L")
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="R")

    def section_header(self, text):
        self.set_fill_color(*AMBER)
        self.set_text_color(*WHITE)
        self.set_font("Helvetica", "B", 13)
        self.cell(0, 10, f"  {text}", new_x="LMARGIN", new_y="NEXT", fill=True)
        self.ln(3)

    def sub_header(self, number, text):
        self.set_text_color(*DARK)
        self.set_font("Helvetica", "B", 10.5)
        self.cell(0, 7, f"{number}. {text}", new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def bullet(self, text, indent=20):
        self.set_text_color(*GRAY_TEXT)
        self.set_font("Helvetica", "", 9.5)
        x = self.get_x()
        self.set_x(x + indent)
        # Render bullet with bold fragments
        self.cell(4, 5.5, "-")
        self._render_rich_line(text, self.w - x - indent - 20)
        self.ln(1)

    def _render_rich_line(self, text, max_w):
        """Render text with **bold** markdown fragments inline."""
        parts = text.split("**")
        for i, part in enumerate(parts):
            if i % 2 == 1:
                self.set_font("Helvetica", "B", 9.5)
            else:
                self.set_font("Helvetica", "", 9.5)
            self.set_text_color(*GRAY_TEXT)
            self.write(5.5, part)
        self.ln()

    def step_line(self, number, text):
        self.set_text_color(*DARK)
        self.set_font("Helvetica", "B", 10)
        x0 = self.get_x() + 10
        self.set_x(x0)
        # Circle with number
        cx = self.get_x() + 3.5
        cy = self.get_y() + 3.5
        self.set_fill_color(*AMBER)
        self.set_draw_color(*AMBER)
        self.ellipse(cx - 3.5, cy - 3.5, 7, 7, style="F")
        self.set_text_color(*WHITE)
        self.set_font("Helvetica", "B", 8)
        nw = self.get_string_width(str(number))
        self.set_xy(cx - nw / 2, cy - 2.5)
        self.cell(nw, 5, str(number))
        self.set_xy(x0 + 10, cy - 3)
        self.set_text_color(*GRAY_TEXT)
        self.set_font("Helvetica", "", 9.5)
        self._render_rich_line(text, self.w - x0 - 25)
        self.ln(1)


def draw_table(pdf, headers, rows, col_widths):
    """Draw a table with header and alternating row shading."""
    x_start = pdf.get_x()

    # Header row
    pdf.set_fill_color(*TABLE_HEADER)
    pdf.set_text_color(*WHITE)
    pdf.set_font("Helvetica", "B", 9)
    for i, h in enumerate(headers):
        pdf.cell(col_widths[i], 8, f"  {h}", border=0, fill=True)
    pdf.ln()

    # Data rows
    pdf.set_font("Helvetica", "", 8.5)
    for r_idx, row in enumerate(rows):
        if r_idx % 2 == 0:
            pdf.set_fill_color(*ROW_EVEN)
        else:
            pdf.set_fill_color(*ROW_ALT)
        pdf.set_text_color(*GRAY_TEXT)
        pdf.set_x(x_start)
        for i, val in enumerate(row):
            pdf.cell(col_widths[i], 7, f"  {val}", border=0, fill=True)
        pdf.ln()

    # Bottom line
    pdf.set_draw_color(220, 220, 220)
    pdf.line(x_start, pdf.get_y(), x_start + sum(col_widths), pdf.get_y())
    pdf.ln(3)


def build():
    pdf = WedjaDoc()
    pdf.alias_nb_pages()
    pdf.add_page()

    # ── Title Block ──
    pdf.set_fill_color(*LIGHT_AMBER)
    pdf.rect(0, 0, pdf.w, 52, "F")

    pdf.set_y(12)
    pdf.set_font("Helvetica", "B", 24)
    pdf.set_text_color(*DARK)
    pdf.cell(0, 12, "Wedja AI", align="C", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 14)
    pdf.set_text_color(*GRAY_TEXT)
    pdf.cell(0, 8, "Data Requirements", align="C", new_x="LMARGIN", new_y="NEXT")

    # Amber accent line
    line_w = 50
    pdf.set_draw_color(*AMBER)
    pdf.set_line_width(0.8)
    pdf.line((pdf.w - line_w) / 2, pdf.get_y() + 3, (pdf.w + line_w) / 2, pdf.get_y() + 3)

    pdf.ln(10)

    # Meta info
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*GRAY_TEXT)
    meta = [
        ("To:", "Financial Controller"),
        ("From:", "Ibrahim Abu Ashara"),
        ("Date:", "25 March 2026"),
    ]
    for label, value in meta:
        pdf.set_x(15)
        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(12, 5.5, label)
        pdf.set_font("Helvetica", "", 9)
        pdf.cell(0, 5.5, value, new_x="LMARGIN", new_y="NEXT")

    pdf.ln(5)

    # ── Section 1: From FC ──
    pdf.section_header("From FC -- Monthly Data Exports")
    pdf.set_font("Helvetica", "I", 8.5)
    pdf.set_text_color(*GRAY_TEXT)
    pdf.cell(
        0, 5,
        'Export from JDE every month and upload to app.wedja.ai/dashboard/import (select "JDE Revenue Analysis" type).',
        new_x="LMARGIN", new_y="NEXT",
    )
    pdf.ln(3)

    fc_items = [
        ("Revenue Analysis by Category", [
            "Same format as the 2025 file already sent",
            "Need: **2026 data (January - March)** as soon as available",
            "Monthly updates going forward",
            "Format: Excel (.xlsx)",
        ]),
        ("Tenant Reported Sales", [
            "Tenant name, unit number, period (month/year), reported revenue (EGP)",
            "For all tenants who pay percentage rent",
            "Monthly",
            "Format: Excel or CSV",
        ]),
        ("Expense Report", [
            "Category, description, amount (EGP), vendor, date, invoice reference",
            "All mall operating expenses",
            "Monthly",
            "Format: Excel or CSV",
        ]),
        ("Rent Collection Status", [
            "Tenant name, unit number, amount due, amount paid, payment date, status",
            "Current month",
            "Monthly",
            "Format: Excel or CSV",
        ]),
        ("Tenant Master List (when changes happen)", [
            "Tenant name, brand name, category, unit number, contact person, email, phone",
            "Only when tenants change (new tenant, leaves, contact update)",
            "Format: Excel or CSV",
        ]),
    ]

    for idx, (title, bullets) in enumerate(fc_items, 1):
        pdf.sub_header(idx, title)
        for b in bullets:
            pdf.bullet(b)
        pdf.ln(2)

    # ── Section 2: From IT Team ──
    pdf.section_header("From IT Team -- Still Pending")
    pdf.set_font("Helvetica", "I", 8.5)
    pdf.set_text_color(*GRAY_TEXT)
    pdf.cell(0, 5, "Please follow up with IT on these items.", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    # IT Item 1
    pdf.sub_header(1, "VPN Access (URGENT)")
    for b in [
        "We need VPN access to the camera network",
        "Subnets: 192.168.16.x, 192.168.20.x - 192.168.24.x",
        "Type: OpenVPN or WireGuard config file + credentials",
        "Send to: ibrahim@abuashara.com",
        "**Alternative:** Port-forward the 6 gate cameras through the public IP:",
    ]:
        pdf.bullet(b)
    pdf.ln(2)

    # Camera table
    cam_headers = ["Camera IP", "Location", "Forward to Port"]
    cam_rows = [
        ("192.168.16.201", "Gate 1", "5541"),
        ("192.168.16.202", "Gate 1", "5542"),
        ("192.168.16.203", "Gate 2", "5543"),
        ("192.168.16.204", "Gate 2", "5544"),
        ("192.168.16.205", "Gate 3", "5545"),
        ("192.168.16.206", "Gate 4", "5546"),
    ]
    pdf.set_x(25)
    draw_table(pdf, cam_headers, cam_rows, [50, 50, 50])

    # IT Item 2
    pdf.sub_header(2, "On-Site Server (When Ready)")
    for b in [
        "Ubuntu Linux server in the server room",
        "8GB+ RAM, connected to camera VLAN + internet",
        "We will provide the software",
        "Not urgent -- but needed for production",
    ]:
        pdf.bullet(b)
    pdf.ln(2)

    # IT Item 3
    pdf.sub_header(3, "JDE Technical Questions")
    for b in [
        "What version of JD Edwards is installed?",
        "Does JDE have REST APIs (AIS) enabled?",
        "Is direct database read access available?",
        "These answers help us plan automated data sync in the future",
    ]:
        pdf.bullet(b)
    pdf.ln(4)

    # ── Section 3: How to Upload ──
    pdf.section_header("How to Upload Data")
    pdf.ln(2)

    steps = [
        'Go to **app.wedja.ai**',
        "Login with your credentials",
        'Click **"JDE Import"** in the sidebar (under Business)',
        "Select the data type",
        "Drop the Excel/CSV file",
        "Click Import",
    ]
    for i, step in enumerate(steps, 1):
        pdf.step_line(i, step)

    pdf.ln(2)
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(*GRAY_TEXT)
    pdf.cell(0, 6, "The system will match tenants automatically and show you results.", align="C",
             new_x="LMARGIN", new_y="NEXT")

    pdf.ln(5)

    # ── Section 4: Monthly Schedule ──
    pdf.section_header("Monthly Schedule")
    pdf.ln(2)

    sched_headers = ["When", "What", "Who"]
    sched_rows = [
        ("1st of each month", "Revenue Analysis export from JDE", "FC"),
        ("1st of each month", "Tenant Reported Sales export", "FC"),
        ("1st of each month", "Expense Report export", "FC"),
        ("5th of each month", "Rent Collection Status", "FC"),
        ("As needed", "Tenant changes", "FC"),
        ("ASAP", "VPN access setup", "IT"),
        ("ASAP", "JDE version info", "IT"),
    ]
    draw_table(pdf, sched_headers, sched_rows, [45, 95, 25])

    pdf.ln(4)

    # Contact footer
    pdf.set_draw_color(*AMBER)
    pdf.set_line_width(0.4)
    pdf.line(15, pdf.get_y(), pdf.w - 15, pdf.get_y())
    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 9.5)
    pdf.set_text_color(*DARK)
    pdf.cell(15, 6, "Questions?")
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(*AMBER)
    pdf.cell(0, 6, "ibrahim@abuashara.com")

    pdf.output(OUTPUT)
    print(f"PDF generated: {OUTPUT}")
    print(f"Pages: {pdf.pages_count}")


if __name__ == "__main__":
    build()
