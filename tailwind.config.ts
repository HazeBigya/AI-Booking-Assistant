import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/client/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-outfit)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      spacing: { 76: "19rem" },
      colors: {
        // One cool-neutral family plus a single desaturated accent.
        ink: { DEFAULT: "#18181b", soft: "#52525b", faint: "#a1a1aa" },
        accent: { 50: "#f0fdfa", 100: "#ccfbf1", 400: "#2dd4bf", 600: "#0d9488", 700: "#0f766e" },
      },
      boxShadow: {
        // Wide and shallow: depth without a visible drop shadow.
        diffuse: "0 20px 40px -24px rgba(24,24,27,0.18)",
        lift: "0 24px 48px -20px rgba(24,24,27,0.22)",
        inset: "inset 0 1px 0 rgba(255,255,255,0.6)",
      },
      transitionTimingFunction: {
        glide: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        breathe: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.55", transform: "scale(0.82)" },
        },
        shimmer: {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(100%)" },
        },
        bar: {
          "0%, 100%": { transform: "scaleY(0.28)" },
          "50%": { transform: "scaleY(1)" },
        },
        halo: {
          "0%": { opacity: "0.5", transform: "scale(1)" },
          "100%": { opacity: "0", transform: "scale(1.9)" },
        },
      },
      animation: {
        rise: "rise 0.42s cubic-bezier(0.16, 1, 0.3, 1) both",
        breathe: "breathe 1.4s cubic-bezier(0.16, 1, 0.3, 1) infinite",
        shimmer: "shimmer 1.8s cubic-bezier(0.16, 1, 0.3, 1) infinite",
        bar: "bar 1s cubic-bezier(0.16, 1, 0.3, 1) infinite",
        halo: "halo 1.8s cubic-bezier(0.16, 1, 0.3, 1) infinite",
      },
    },
  },
  plugins: [typography],
};

export default config;
