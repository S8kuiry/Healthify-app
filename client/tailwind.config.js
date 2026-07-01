// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  // 1. Tell Tailwind where your components and routes are located
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
    "./src/app/**/*.{js,jsx,ts,tsx}",
    "./src/components/**/*.{js,jsx,ts,tsx}"
  ],
  // 2. Inject the NativeWind preset hook
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
        colors: {
          // Tailwind reads the live values directly from the CSS engine variables
        background: "var(--background)",
        backgroundElement: "var(--background-element)",
        backgroundSelected: "var(--background-selected)",
        textPrimary: "var(--text-primary)",
        textSecondary: "var(--text-secondary)",
        textMuted: "var(--text-muted)",
        accent: "var(--accent)",
        accentLight: "var(--accentLight)",
        danger: "var(--danger)",
        cardBackground: "var(--card-background)",
        lightBackground: "var(--lightBackground)",
        border: "var(--border)", // 💡 Added this for clean bounding boxes

         
        },
      
    },
  },
  plugins: [],
}