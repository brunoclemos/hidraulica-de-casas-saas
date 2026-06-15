import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brandbook Hidráulica de Casas
        ink: {
          DEFAULT: "#21211F", // preto-petróleo da marca
          900: "#191917",
          800: "#21211F",
          700: "#2C2C29",
          600: "#3A3A36",
          500: "#4A4A45",
        },
        amber: {
          DEFAULT: "#FABA0D", // âmbar da marca
          soft: "#FFD45E",
          deep: "#D89A00",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      keyframes: {
        flow: { to: { strokeDashoffset: "-28" } },
        liveDot: {
          "0%,100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: ".4", transform: "scale(.85)" },
        },
        marquee: { to: { transform: "translateX(-50%)" } },
      },
      animation: {
        flow: "flow 1s linear infinite",
        "live-dot": "liveDot 1.4s ease-in-out infinite",
        marquee: "marquee 22s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
