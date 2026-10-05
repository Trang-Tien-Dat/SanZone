/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        pitch: {
          900: "#0b3d24",
          700: "#13603a",
          600: "#1a7a4a",
          100: "#dff2e5",
          50: "#f3faf5",
        },
        whistle: "#f5c542",
        ink: { DEFAULT: "#15261c", soft: "#52665a" },
        edge: "#d5e6da",
      },
      fontFamily: {
        sans: ["Be Vietnam Pro", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      // các kích thước HomePage dùng mà v3 không có sẵn
      spacing: {
        4.5: "1.125rem",
        9.5: "2.375rem",
        13: "3.25rem",
        17: "4.25rem",
        18: "4.5rem",
        22: "5.5rem",
      },
      borderWidth: { 3: "3px" },
      ringWidth: { 3: "3px" },
    },
  },
  plugins: [],
};