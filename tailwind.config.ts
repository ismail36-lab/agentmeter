import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#090d16",
        foreground: "#f8fafc",
        card: {
          DEFAULT: "#0f172a",
          foreground: "#f8fafc",
        },
        primary: {
          DEFAULT: "#10b981",
          foreground: "#022c22",
        },
        secondary: {
          DEFAULT: "#0ea5e9",
          foreground: "#0c4a6e",
        },
        accent: {
          DEFAULT: "#8b5cf6",
          foreground: "#2e1065",
        },
        muted: {
          DEFAULT: "#1e293b",
          foreground: "#94a3b8",
        },
        border: "#1e293b",
      },
      fontFamily: {
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
