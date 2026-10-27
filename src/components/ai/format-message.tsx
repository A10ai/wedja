import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Render the chat assistant's lightweight markdown (**bold**, "- " lists,
 * "1. " lists, [CRITICAL]-style labels) as React elements.
 *
 * Replies quote database text such as tenant names, alert descriptions and
 * ticket titles, so this must never build HTML strings — React escapes every
 * text node it renders here.
 */

const LABEL_CLASS: Record<string, string> = {
  CRITICAL: "text-red-500",
  WARNING: "text-amber-500",
  OPPORTUNITY: "text-emerald-500",
  INFO: "text-blue-500",
};

const INLINE = /(\*\*[^*]+?\*\*|\[(?:CRITICAL|WARNING|OPPORTUNITY|INFO)\])/g;

export function renderInline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} className="text-text-primary font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    const label = part.match(/^\[(CRITICAL|WARNING|OPPORTUNITY|INFO)\]$/);
    if (label) {
      return (
        <span key={i} className={cn(LABEL_CLASS[label[1]], "font-semibold text-xs")}>
          {part}
        </span>
      );
    }
    return part;
  });
}

export function formatMessage(text: string): ReactNode[] {
  return text.split("\n").map((line, i) => {
    // List items
    if (line.startsWith("- ") || line.startsWith("  - ")) {
      const indent = line.startsWith("  - ") ? "ml-4" : "";
      return (
        <div key={i} className={cn("flex gap-2 py-0.5", indent)}>
          <span className="text-wedja-accent mt-0.5 shrink-0">&#8226;</span>
          <span>{renderInline(line.replace(/^\s*-\s+/, ""))}</span>
        </div>
      );
    }
    // Numbered items
    const numMatch = line.match(/^(\d+)\.\s/);
    if (numMatch) {
      return (
        <div key={i} className="flex gap-2 py-0.5">
          <span className="text-wedja-accent font-mono text-xs mt-0.5 shrink-0 w-4 text-right">
            {numMatch[1]}.
          </span>
          <span>{renderInline(line.slice(numMatch[0].length))}</span>
        </div>
      );
    }
    if (line.trim() === "") return <div key={i} className="h-2" />;
    return (
      <div key={i} className="py-0.5">
        {renderInline(line)}
      </div>
    );
  });
}
