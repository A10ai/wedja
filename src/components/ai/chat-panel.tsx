"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Eye, X, Send, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: string;
  timestamp: Date;
}

const QUICK_PROMPTS = [
  "Status update",
  "Who's underreporting?",
  "Footfall today",
  "Overdue rent?",
  "Vacant units?",
];

export function AIChatPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/v1/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim() }),
      });

      const data = await res.json();

      const assistantMsg: ChatMessage = {
        id: `msg_${Date.now()}_resp`,
        role: "assistant",
        content: data.message || "I could not process that request.",
        type: data.type,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}_err`,
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // Format markdown-like text simply
  function formatMessage(text: string) {
    return text.split("\n").map((line, i) => {
      // Bold
      let formatted = line.replace(
        /\*\*(.*?)\*\*/g,
        '<strong class="text-text-primary font-semibold">$1</strong>'
      );
      // List items
      if (formatted.startsWith("- ") || formatted.startsWith("  - ")) {
        const indent = formatted.startsWith("  - ") ? "ml-4" : "";
        formatted = formatted.replace(/^-\s+|^\s+-\s+/, "");
        return (
          <div key={i} className={cn("flex gap-2 py-0.5", indent)}>
            <span className="text-custis-gold mt-0.5 shrink-0">&#8226;</span>
            <span dangerouslySetInnerHTML={{ __html: formatted }} />
          </div>
        );
      }
      // Numbered items
      const numMatch = formatted.match(/^(\d+)\.\s/);
      if (numMatch) {
        formatted = formatted.replace(/^\d+\.\s/, "");
        return (
          <div key={i} className="flex gap-2 py-0.5">
            <span className="text-custis-gold font-mono text-xs mt-0.5 shrink-0 w-4 text-right">
              {numMatch[1]}.
            </span>
            <span dangerouslySetInnerHTML={{ __html: formatted }} />
          </div>
        );
      }
      // Labels like [CRITICAL]
      formatted = formatted
        .replace(
          /\[CRITICAL\]/g,
          '<span class="text-red-500 font-semibold text-xs">[CRITICAL]</span>'
        )
        .replace(
          /\[WARNING\]/g,
          '<span class="text-amber-500 font-semibold text-xs">[WARNING]</span>'
        )
        .replace(
          /\[OPPORTUNITY\]/g,
          '<span class="text-emerald-500 font-semibold text-xs">[OPPORTUNITY]</span>'
        )
        .replace(
          /\[INFO\]/g,
          '<span class="text-blue-500 font-semibold text-xs">[INFO]</span>'
        );
      if (formatted.trim() === "") return <div key={i} className="h-2" />;
      return (
        <div
          key={i}
          className="py-0.5"
          dangerouslySetInnerHTML={{ __html: formatted }}
        />
      );
    });
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200",
          open
            ? "bg-custis-card border border-custis-border text-text-secondary hover:text-text-primary rotate-0"
            : "bg-custis-gold text-white hover:bg-custis-gold-hover shadow-custis-gold/25"
        )}
        aria-label={open ? "Close AI chat" : "Open AI chat"}
      >
        {open ? <X size={22} /> : <Eye size={24} />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[400px] max-w-[calc(100vw-48px)] h-[560px] max-h-[calc(100vh-120px)] bg-custis-card border border-custis-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="px-4 py-3 border-b border-custis-border bg-custis-gold-muted/30 flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-full bg-custis-gold flex items-center justify-center">
              <Eye size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-text-primary">
                Custis AI
              </h3>
              <p className="text-xs text-text-muted">
                Ask about your property
              </p>
            </div>
            <Sparkles size={16} className="text-custis-gold" />
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <Eye
                  size={36}
                  className="mx-auto text-custis-gold opacity-50 mb-3"
                />
                <p className="text-sm text-text-muted mb-4">
                  Ask me anything about Senzo Mall
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => sendMessage(prompt)}
                      className="px-3 py-1.5 text-xs rounded-full border border-custis-border text-text-secondary hover:text-custis-gold hover:border-custis-gold transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm",
                    msg.role === "user"
                      ? "bg-custis-gold text-white rounded-br-sm"
                      : "bg-custis-border/30 text-text-secondary rounded-bl-sm"
                  )}
                >
                  {msg.role === "assistant" ? (
                    <div className="space-y-0.5 text-[13px] leading-relaxed">
                      {formatMessage(msg.content)}
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-custis-border/30 rounded-xl px-4 py-3 rounded-bl-sm">
                  <div className="flex items-center gap-2 text-text-muted text-sm">
                    <Loader2 size={14} className="animate-spin" />
                    Thinking...
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick prompts (if conversation started) */}
          {messages.length > 0 && !loading && (
            <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto shrink-0">
              {QUICK_PROMPTS.slice(0, 3).map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="px-2.5 py-1 text-[11px] rounded-full border border-custis-border text-text-muted hover:text-custis-gold hover:border-custis-gold transition-colors whitespace-nowrap shrink-0"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="px-3 py-3 border-t border-custis-border flex items-center gap-2 shrink-0"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Custis..."
              disabled={loading}
              className="flex-1 px-3 py-2 rounded-lg text-sm bg-custis-bg border border-custis-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-custis-gold focus:border-transparent disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="p-2 rounded-lg bg-custis-gold text-white hover:bg-custis-gold-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Send message"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
