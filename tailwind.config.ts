import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#F5F5F7",
        ink: "#1D1D1F",
        steel: "#6E6E73",
        line: "#E5E5EA",
        safety: "#34C759",
        machine: "#0071E3",
        primary: {
          DEFAULT: "#0071E3",
          dark: "#006EDB",
          soft: "#E8F1FD"
        },
        success: "#34C759",
        warning: "#FF9F0A",
        danger: "#FF3B30"
      },
      boxShadow: {
        panel: "0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.05)",
        soft: "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.05)",
        raised: "0 2px 4px rgba(0,0,0,0.05), 0 12px 32px rgba(0,0,0,0.08)",
        dialog: "0 4px 12px rgba(0,0,0,0.08), 0 24px 60px rgba(0,0,0,0.12)"
      },
      transitionTimingFunction: {
        apple: "cubic-bezier(0.32, 0.72, 0, 1)"
      }
    }
  },
  plugins: []
};

export default config;
