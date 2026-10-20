/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "#0B0F17",
        surface: "#111A27",
        raised: "#16212F",
        line: "#1A2637",
        line2: "#253449",
        ink: "#E6EEF7",
        dim: "#91A0B5",
        faint: "#5E6E84",
        accent: "#57C9C0",
        accent2: "#3FA9A1",
        caution: "#E5AA59",
        danger: "#E56B6B",
        info: "#7FA6E0",
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Cascadia Code", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
