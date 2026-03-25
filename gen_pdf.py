#!/usr/bin/env python3
"""Generate Wedja IT Update PDF."""

from fpdf import FPDF

class WedjaReport(FPDF):
    AMBER = (245, 158, 11)
    DARK = (31, 41, 55)
    BODY = (55, 65, 81)
    LIGHT_BG = (255, 251, 235)  # warm tint for good-news box
    TABLE_HEADER_BG = (245, 158, 11)
    TABLE_ALT_BG = (249, 250, 251)
    WHITE = (255, 255, 255)

    def header(self):
        if self.page_no() == 1:
            # Title block
            self.set_font("Helvetica", "B", 22)
            self.set_text_color(*self.DARK)
            self.cell(0, 12, "Wedja AI", new_x="LMARGIN", new_y="NEXT")
            self.set_font("Helvetica", "", 13)
            self.set_text_color(*self.BODY)
            self.cell(0, 8, "IT Update & Requests", new_x="LMARGIN", new_y="NEXT")
            # Date / From line
            self.set_font("Helvetica", "", 9)
            self.set_text_color(120, 120, 120)
            self.cell(0, 6, "25 March 2026  |  From: Ibrahim Abu Ashara", new_x="LMARGIN", new_y="NEXT")
            # Rule
            self.set_draw_color(*self.AMBER)
            self.set_line_width(0.6)
            self.line(self.l_margin, self.get_y() + 3, self.w - self.r_margin, self.get_y() + 3)
            self.ln(8)

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(160, 160, 160)
        self.cell(0, 10, "wedja.ai", align="C")

    def section_header(self, num, title):
        self.ln(3)
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(*self.AMBER)
        label = f"{num}. {title}" if num else title
        self.cell(0, 8, label, new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(*self.AMBER)
        self.set_line_width(0.3)
        self.line(self.l_margin, self.get_y(), self.l_margin + 45, self.get_y())
        self.ln(3)

    def body_text(self, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*self.BODY)
        self.multi_cell(0, 5.5, text)
        self.ln(1)

    def bullet(self, text, bold_prefix=None):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*self.BODY)
        x = self.get_x()
        self.cell(6, 5.5, "-")
        if bold_prefix:
            self.set_font("Helvetica", "B", 10)
            self.write(5.5, bold_prefix + " ")
            self.set_font("Helvetica", "", 10)
            self.multi_cell(0, 5.5, text)
        else:
            self.multi_cell(0, 5.5, text)
        self.ln(0.5)


def build_pdf(output_path):
    pdf = WedjaReport(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.set_margins(18, 15, 18)
    pdf.add_page()

    # --- Good News box ---
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(*WedjaReport.AMBER)
    pdf.cell(0, 8, "Good News", new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(*WedjaReport.AMBER)
    pdf.set_line_width(0.3)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.l_margin + 45, pdf.get_y())
    pdf.ln(3)

    # Highlighted box
    box_y = pdf.get_y()
    pdf.set_fill_color(*WedjaReport.LIGHT_BG)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*WedjaReport.BODY)
    text = (
        "Camera connection is working. We successfully connected to one camera "
        "via the public IP (196.219.205.230) and have been counting people for "
        "12+ hours. Yesterday we counted 2,484 visitors from a single corridor camera."
    )
    pdf.multi_cell(0, 5.5, text, fill=True)
    pdf.ln(4)

    # --- Section 1: VPN Access ---
    pdf.section_header(1, "VPN Access (Most Important)")
    pdf.body_text("We need VPN access to the camera network to connect to all 172 cameras.")
    pdf.bullet("OpenVPN or WireGuard preferred", bold_prefix="What type:")
    pdf.bullet("192.168.16.x, 192.168.20-24.x", bold_prefix="Subnets needed:")
    pdf.bullet("VPN config file + credentials", bold_prefix="Provide:")
    pdf.bullet("Port forward the 6 gate cameras (192.168.16.201-206) on different ports", bold_prefix="Alternative:")
    pdf.ln(2)

    # --- Section 2: Gate Camera Priority ---
    pdf.section_header(2, "Gate Camera Priority")
    pdf.body_text(
        "If VPN takes time, please port-forward these 6 gate cameras through the public IP. "
        "These are the ceiling-mounted people counting cameras at all mall entrances."
    )
    pdf.ln(1)

    # Table
    col_w = [52, 58, 52]
    headers = ["Camera IP", "Location", "Suggested Port"]
    rows = [
        ("192.168.16.201", "Gate 1", "5541"),
        ("192.168.16.202", "Gate 1", "5542"),
        ("192.168.16.203", "Gate 2", "5543"),
        ("192.168.16.204", "Gate 2", "5544"),
        ("192.168.16.205", "Gate 3", "5545"),
        ("192.168.16.206", "Gate 4", "5546"),
    ]

    # Header row
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(*WedjaReport.TABLE_HEADER_BG)
    pdf.set_text_color(*WedjaReport.WHITE)
    for i, h in enumerate(headers):
        pdf.cell(col_w[i], 7, h, border=0, fill=True, align="C")
    pdf.ln()

    # Data rows
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*WedjaReport.BODY)
    for idx, row in enumerate(rows):
        if idx % 2 == 1:
            pdf.set_fill_color(*WedjaReport.TABLE_ALT_BG)
            fill = True
        else:
            pdf.set_fill_color(*WedjaReport.WHITE)
            fill = True
        for i, val in enumerate(row):
            pdf.cell(col_w[i], 6.5, val, border=0, fill=fill, align="C")
        pdf.ln()
    pdf.ln(3)

    # --- Section 3: JDE Monthly Exports ---
    pdf.section_header(3, "JDE Monthly Exports")
    pdf.body_text("We received the 2025 Revenue Analysis file -- thank you. We now need:")
    pdf.bullet("2026 (Jan-Mar) when available", bold_prefix="Same revenue file for")
    pdf.bullet("category, amount, vendor, date", bold_prefix="Monthly expense report:")
    pdf.bullet("tenant, period, reported revenue", bold_prefix="Monthly tenant reported sales:")
    pdf.ln(2)

    # --- Section 4: Firewall Whitelist ---
    pdf.section_header(4, "Firewall Whitelist (Still Pending)")
    pdf.body_text("Office PCs still cannot access:")
    pdf.bullet("app.wedja.ai")
    pdf.bullet("app.hospitai.uk")
    pdf.ln(1)
    pdf.body_text("Please whitelist these domains + *.vercel.app + *.supabase.co")
    pdf.ln(2)

    # --- Section 5: On-Site Server ---
    pdf.section_header(5, "On-Site Server (When Ready)")
    pdf.body_text(
        "For production, we need a server in the server room. "
        "This is not urgent -- currently running from our development machine."
    )
    pdf.bullet("Ubuntu Linux, 8GB+ RAM")
    pdf.bullet("Connected to camera VLAN")
    pdf.bullet("Internet access for pushing data to cloud")
    pdf.bullet("We will provide the software to install")
    pdf.ln(4)

    # --- Contact line ---
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*WedjaReport.BODY)
    pdf.cell(0, 6, "Please send VPN config to: ", new_x="END")
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(0, 6, "ibrahim@abuashara.com", new_x="LMARGIN", new_y="NEXT")

    pdf.output(output_path)
    print(f"PDF saved to {output_path}")


if __name__ == "__main__":
    build_pdf("/Users/ai10/Desktop/HospitAI/Wedja-IT-Update-March25.pdf")
