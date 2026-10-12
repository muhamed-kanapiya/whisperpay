import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: {
    colors: { background: "#07070A", surface: "#101016", mint: "#14F195", purple: "#9945FF", muted: "#9797A7" },
    fontFamily: { sans: ["Inter", "sans-serif"] },
    boxShadow: { glow: "0 0 48px -16px #9945ff70" },
  } },
  plugins: [],
} satisfies Config;
