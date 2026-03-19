import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "wedja-bg": "var(--wedja-bg)",
        "wedja-card": "var(--wedja-card)",
        "wedja-elevated": "var(--wedja-elevated)",
        "wedja-border": "var(--wedja-border)",
        "wedja-accent": "var(--wedja-accent)",
        "wedja-accent-hover": "var(--wedja-accent-hover)",
        "wedja-accent-muted": "var(--wedja-accent-muted)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-muted)",
        "status-success": "#10B981",
        "status-warning": "#F59E0B",
        "status-error": "#EF4444",
        "status-info": "#3B82F6",
      },
      fontFamily: {
        sans: ["var(--font-instrument)", "Instrument Sans", "system-ui", "sans-serif"],
        display: ["var(--font-jura)", "Jura", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "Geist Mono", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-in": "slideIn 0.3s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideIn: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
