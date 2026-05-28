import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#9fb997",
          light: "#c8d4c0",
          dark: "#6b8c64",
        },
        background: "#f4f2f0",
        "background-alt": "#eceae7",
        foreground: "#1e2822",
        "text-secondary": "#4a5248",
        "text-muted": "#7a8578",
        border: "rgba(159,185,151,0.22)",
        "border-strong": "rgba(159,185,151,0.44)",
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        sans: ["var(--font-body)", "Plus Jakarta Sans", "sans-serif"],
      },
      borderRadius: {
        sm: "8px",
        md: "14px",
        lg: "22px",
        xl: "28px",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
