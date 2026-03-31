#!/usr/bin/env python3
"""
Generate Wedja AI CCTV Server Setup Request PDF.
Uses fpdf2 for professional layout with amber headers, code blocks, and checklist.
"""

from fpdf import FPDF

OUTPUT_PATH = "/Users/ai10/Desktop/HospitAI/Wedja-CCTV-Server-Setup.pdf"

# Brand colors
AMBER = (245, 158, 11)       # #F59E0B
DARK_BG = (30, 30, 30)       # Code block background
CODE_TEXT = (220, 220, 220)   # Code block text
BODY_TEXT = (55, 55, 55)      # #373737
HEADING_RULE = (245, 158, 11)
LIGHT_GRAY = (245, 245, 245)
CHECK_GREEN = (34, 197, 94)


class WedjaDocument(FPDF):
    def __init__(self):
        super().__init__(format="A4")
        self.set_auto_page_break(auto=True, margin=25)

    def header(self):
        if self.page_no() == 1:
            return  # Title page header handled manually
        # Thin amber line at top
        self.set_draw_color(*AMBER)
        self.set_line_width(0.6)
        self.line(15, 12, self.w - 15, 12)

    def footer(self):
        self.set_y(-18)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(160, 160, 160)
        self.cell(0, 10, "wedja.ai", align="L")
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="R")

    def section_header(self, text):
        """Amber section header with underline."""
        self.ln(6)
        self.set_font("Helvetica", "B", 15)
        self.set_text_color(*AMBER)
        self.cell(0, 10, text, new_x="LMARGIN", new_y="NEXT")
        # Amber rule under header
        y = self.get_y() - 1
        self.set_draw_color(*AMBER)
        self.set_line_width(0.5)
        self.line(self.l_margin, y, self.w - self.r_margin, y)
        self.ln(3)

    def sub_header(self, text):
        """Numbered step sub-header."""
        self.ln(4)
        self.set_font("Helvetica", "B", 12)
        self.set_text_color(*BODY_TEXT)
        self.cell(0, 8, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def body_text(self, text):
        """Standard body paragraph."""
        self.set_font("Helvetica", "", 10.5)
        self.set_text_color(*BODY_TEXT)
        self.multi_cell(0, 6, text)
        self.ln(1)

    def bullet_list(self, items):
        """Bulleted list."""
        self.set_font("Helvetica", "", 10.5)
        self.set_text_color(*BODY_TEXT)
        for item in items:
            x = self.get_x()
            self.set_x(x + 6)
            self.cell(5, 6, "-")
            self.multi_cell(0, 6, item)
            self.ln(0.5)
        self.ln(1)

    def code_block(self, code):
        """Dark background code block with monospace font."""
        self.ln(1)
        padding = 4
        x = self.l_margin + 2
        w = self.w - self.l_margin - self.r_margin - 4
        # Measure height
        self.set_font("Courier", "", 10)
        lines = code.strip().split("\n")
        line_h = 5.5
        block_h = len(lines) * line_h + padding * 2

        # Check if we need a page break
        if self.get_y() + block_h > self.h - 25:
            self.add_page()

        y = self.get_y()
        # Draw dark rounded rectangle
        self.set_fill_color(*DARK_BG)
        self.rect(x, y, w, block_h, style="F")

        self.set_text_color(*CODE_TEXT)
        self.set_font("Courier", "", 10)
        self.set_y(y + padding)
        for line in lines:
            self.set_x(x + padding + 2)
            self.cell(0, line_h, line)
            self.ln(line_h)
        self.set_y(y + block_h + 2)
        self.ln(1)

    def bold_bullet_list(self, items):
        """Bullet list where text before the first dash is bold."""
        self.set_text_color(*BODY_TEXT)
        for item in items:
            x = self.get_x()
            self.set_x(x + 6)
            self.set_font("Helvetica", "", 10.5)
            self.cell(5, 6, "-")

            if " -- " in item:
                bold_part, rest = item.split(" -- ", 1)
                self.set_font("Helvetica", "B", 10.5)
                bold_w = self.get_string_width(bold_part + " ") + 1
                self.cell(bold_w, 6, bold_part + " ")
                self.set_font("Helvetica", "", 10.5)
                self.multi_cell(0, 6, "-- " + rest)
            else:
                self.set_font("Helvetica", "", 10.5)
                self.multi_cell(0, 6, item)
            self.ln(0.5)
        self.ln(1)

    def checklist(self, items):
        """Checklist with empty checkboxes."""
        self.set_text_color(*BODY_TEXT)
        for item in items:
            x = self.get_x()
            self.set_x(x + 6)
            # Draw checkbox
            bx = self.get_x()
            by = self.get_y() + 1
            self.set_draw_color(120, 120, 120)
            self.set_line_width(0.3)
            self.rect(bx, by, 4, 4, style="D")
            self.set_x(bx + 7)
            self.set_font("Helvetica", "", 10.5)
            self.multi_cell(0, 6, item)
            self.ln(1)
        self.ln(1)

    def info_box(self, label, value):
        """Metadata line: bold label + normal value."""
        self.set_font("Helvetica", "B", 10.5)
        self.set_text_color(*BODY_TEXT)
        lw = self.get_string_width(label + " ") + 2
        self.cell(lw, 7, label)
        self.set_font("Helvetica", "", 10.5)
        self.cell(0, 7, value, new_x="LMARGIN", new_y="NEXT")


def build_pdf():
    pdf = WedjaDocument()
    pdf.alias_nb_pages()
    pdf.set_margins(20, 20, 20)

    # --- PAGE 1: Title block + Problem + Solution ---
    pdf.add_page()

    # Title area with amber accent bar
    pdf.set_fill_color(*AMBER)
    pdf.rect(20, 18, 4, 28, style="F")  # Accent bar

    pdf.set_xy(30, 18)
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(30, 30, 30)
    pdf.cell(0, 12, "Wedja AI")
    pdf.ln(12)
    pdf.set_x(30)
    pdf.set_font("Helvetica", "", 14)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 10, "CCTV Server Setup Request")
    pdf.ln(16)

    # Separator
    pdf.set_draw_color(220, 220, 220)
    pdf.set_line_width(0.3)
    pdf.line(20, pdf.get_y(), pdf.w - 20, pdf.get_y())
    pdf.ln(6)

    # Metadata
    pdf.info_box("To:", "Deyaa Soliman, IT Manager")
    pdf.info_box("From:", "Ibrahim Abu Ashara")
    pdf.info_box("Date:", "27 March 2026")
    pdf.info_box("Contact:", "ibrahim@abuashara.com")
    pdf.ln(4)

    # Separator
    pdf.set_draw_color(220, 220, 220)
    pdf.line(20, pdf.get_y(), pdf.w - 20, pdf.get_y())
    pdf.ln(2)

    # --- THE PROBLEM ---
    pdf.section_header("The Problem")
    pdf.body_text(
        "We connected to the 6 gate cameras via RTSP port forwarding and tried "
        "reading the Enter/Leave counts from the video stream using OCR (text "
        "recognition on the camera overlay). This approach is unreliable:"
    )
    pdf.bullet_list([
        "OCR misreads numbers frequently (e.g. reads \"7116\" instead of \"116\")",
        "Port forwards drop overnight and camera counters reset",
        "Our count yesterday was 68 while the actual Daily Traffic Report showed 6,586",
        "We are capturing about 1% of actual traffic",
    ])
    pdf.body_text(
        "Reading numbers from video frames is not accurate enough for our "
        "revenue verification system."
    )

    # --- THE SOLUTION ---
    pdf.section_header("The Solution")
    pdf.body_text(
        "The Hikvision cameras have a built-in HTTP API called ISAPI that returns "
        "people counting data as exact numbers -- no video processing needed. "
        "However, ISAPI only works on the local network (port 80 on each camera), "
        "which is not port-forwarded to the internet."
    )
    pdf.body_text(
        "The CCTV server you set up for us (196.219.205.228:33890) is on the local "
        "network and CAN reach the cameras directly. We need to install a small "
        "Python script on this server."
    )

    # --- WHAT WE NEED YOU TO DO ---
    pdf.section_header("What We Need You To Do")

    # Step 1
    pdf.sub_header("Step 1: Install Python on the CCTV Server")
    pdf.bullet_list([
        "Download and install Python 3.11+ from python.org",
        'During installation, check "Add Python to PATH"',
    ])

    # Step 2
    pdf.sub_header("Step 2: Install Required Libraries")
    pdf.body_text(
        "Open Command Prompt (or PowerShell) on the server and run:"
    )
    pdf.code_block("pip install requests schedule")

    # Step 3
    pdf.sub_header("Step 3: Test Camera ISAPI Access")
    pdf.body_text(
        "From the server, open a web browser and go to:"
    )
    pdf.code_block("http://192.168.16.201/ISAPI/Smart/PeopleCounting")
    pdf.body_text(
        "Login with the camera credentials (admin / Hik12345). If you see XML data "
        "with counting numbers, ISAPI is working."
    )
    pdf.body_text("If that URL does not work, try:")
    pdf.code_block("http://192.168.16.201/ISAPI/Smart/PeopleCounting/channels")

    # Step 4
    pdf.sub_header("Step 4: We Will Provide the Script")
    pdf.body_text(
        "Once Python is installed and ISAPI is confirmed working, we will provide "
        "a Python script file. The script:"
    )
    pdf.bold_bullet_list([
        "Reads -- counting data from each gate camera via ISAPI (HTTP GET, read-only)",
        "Sends -- the numbers to our cloud database via HTTPS",
        "Runs -- every 5 minutes automatically",
        "Does NOT -- change any camera settings, NVR configuration, or network settings",
        "Does NOT -- record, store, or transmit any video",
        "Does NOT -- access any other servers or systems",
    ])

    # Step 5
    pdf.sub_header("Step 5: Run the Script")
    pdf.body_text(
        "Place the script file on the Desktop and run:"
    )
    pdf.code_block("python wedja_counter.py")
    pdf.body_text(
        "To keep it running permanently, we can set it up as a Windows service "
        "or scheduled task."
    )

    # --- SECURITY NOTES ---
    pdf.section_header("Security Notes")

    # Light background box for security notes
    y_start = pdf.get_y()
    x_start = pdf.l_margin
    box_w = pdf.w - pdf.l_margin - pdf.r_margin

    security_items = [
        "The script is read-only -- it only queries camera counting data",
        "No video is accessed, recorded, or transmitted",
        "The script only communicates outbound to our Supabase database via HTTPS (port 443)",
        "No inbound ports need to be opened",
        "You can review the full script source code before running it",
        "You can stop it at any time",
    ]

    # Draw background first, then text
    # Estimate height: ~7 per item + padding
    est_h = len(security_items) * 8 + 12
    if pdf.get_y() + est_h > pdf.h - 25:
        pdf.add_page()
        y_start = pdf.get_y()

    pdf.set_fill_color(*LIGHT_GRAY)
    pdf.rect(x_start, y_start, box_w, est_h, style="F")

    # Left amber accent
    pdf.set_fill_color(*AMBER)
    pdf.rect(x_start, y_start, 3, est_h, style="F")

    pdf.set_y(y_start + 5)
    pdf.set_text_color(*BODY_TEXT)
    for item in security_items:
        pdf.set_x(x_start + 8)
        pdf.set_font("Helvetica", "", 10.5)
        pdf.cell(5, 6, "-")
        pdf.multi_cell(0, 6, item)
        self_y = pdf.get_y()
        pdf.set_y(self_y + 1)

    pdf.set_y(y_start + est_h + 4)

    # --- WHAT TO REPORT BACK ---
    pdf.section_header("What to Report Back")
    pdf.body_text(
        "After installing Python and testing ISAPI, please confirm the following:"
    )
    pdf.checklist([
        "Python installed successfully on CCTV-SRV? (yes / no)",
        "Can you access http://192.168.16.201/ISAPI/Smart/PeopleCounting from the server browser? (yes / no -- and what do you see?)",
        "If ISAPI does not work on port 80, does it work on port 443 (HTTPS)?",
    ])

    # --- END ---
    pdf.ln(6)
    pdf.set_draw_color(*AMBER)
    pdf.set_line_width(0.6)
    y = pdf.get_y()
    pdf.line(20, y, pdf.w - 20, y)
    pdf.ln(6)
    pdf.set_font("Helvetica", "I", 10)
    pdf.set_text_color(120, 120, 120)
    pdf.cell(0, 8, "Thank you for your support.", align="C")

    # Save
    pdf.output(OUTPUT_PATH)
    print(f"PDF generated: {OUTPUT_PATH}")
    print(f"Pages: {pdf.page_no()}")


if __name__ == "__main__":
    build_pdf()
