/**
 * RAGSuite Tailwind preset — optional convenience if the dashboard uses Tailwind.
 * Usage (Tailwind v3): module.exports = { presets: [require('./tailwind-preset')] }
 * For Tailwind v4, mirror these into an @theme block instead.
 * The CSS variables in tokens.css remain the canonical source of truth.
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: "#F4F1EA", raised: "#FBFAF6", sunken: "#EDE8DC" },
        ink:   { DEFAULT: "#1B1A17", soft: "#57544C", faint: "#6E6A5C" },
        pine:  { DEFAULT: "#1E3A30", deep: "#16271F", bright: "#2E6A4E", tint: "#E7EDE7" },
        ochre: { DEFAULT: "#B6802E", tint: "#F1E7D2" },
        hairline: { DEFAULT: "#DED7C7", strong: "#C9C0AC" },
        success: "#2E6A4E",
        warning: "#B6802E",
        error:   "#A23B2E",
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'Times New Roman', 'serif'],
        sans:    ['Hanken Grotesk', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
        mono:    ['IBM Plex Mono', 'ui-monospace', 'Menlo', 'monospace'],
      },
      borderRadius: { sm: "8px", md: "12px", lg: "16px", pill: "999px" },
      maxWidth: { content: "1200px", measure: "68ch" },
      boxShadow: {
        resting: "0 1px 2px rgba(27,26,23,.04)",
        raised:  "0 10px 30px rgba(27,26,23,.06)",
      },
      transitionTimingFunction: { brand: "cubic-bezier(.16,1,.3,1)" },
    },
  },
};
