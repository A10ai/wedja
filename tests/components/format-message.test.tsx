import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { formatMessage } from "@/components/ai/format-message";

const html = (text: string) => renderToStaticMarkup(<>{formatMessage(text)}</>);

describe("chat formatMessage", () => {
  test("escapes HTML from database text instead of injecting it", () => {
    const out = html('**Evil<img src=x onerror="alert(1)">** is underreporting');
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  test("escapes HTML in list items, numbered items and plain lines", () => {
    const out = html('- <script>x()</script>\n1. <b>y</b>\n<svg onload=z()>');
    expect(out).not.toMatch(/<script|<b>|<svg/);
    expect(out).toContain("&lt;script&gt;");
  });

  test("renders bold and severity labels as elements", () => {
    const out = html("[CRITICAL] **Adidas** below estimate");
    expect(out).toContain('<strong class="text-text-primary font-semibold">Adidas</strong>');
    expect(out).toMatch(/<span class="text-red-500 font-semibold text-xs">\[CRITICAL\]<\/span>/);
  });

  test("renders bullets with indentation and numbered lists", () => {
    const out = html("- one\n  - two\n3. three");
    expect(out).toContain("ml-4");
    expect(out).toContain("3.</span>");
    expect(out).toContain("three");
  });

  test("blank lines become spacers", () => {
    expect(html("a\n\nb")).toContain('<div class="h-2"></div>');
  });
});
