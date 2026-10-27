/** @type {import('tailwindcss').Config} */
// Colours come from src/styles/tokens.css (Elara Spatial Design System).
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ['"Work Sans"', "system-ui", "sans-serif"] },
      colors: {
        text: "var(--color-text)",
        "text-2": "var(--color-text-secondary)",
        border: "var(--color-border)",
        quiet: "var(--color-surface-quiet)",
        slate: { 1: "var(--color-slate-1)", 2: "var(--color-slate-2)" },
        viewfinder: "var(--color-viewfinder)",
        accent: "var(--color-accent)",
        record: "var(--color-record)",
        captured: "var(--color-captured)",
        retake: "var(--color-retake)",
      },
      fontSize: {
        title: ["28px", { lineHeight: "36px", letterSpacing: "0.5px", fontWeight: "700" }],
        body: ["16px", "24px"],
        tip: ["14px", "20px"],
      },
      spacing: { gutter: "16px" },
    },
  },
  plugins: [],
};
