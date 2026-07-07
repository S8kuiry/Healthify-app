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
          // RGB channels in global.css; <alpha-value> enables /80, /10, etc.
        background: "rgb(var(--background) / <alpha-value>)",
        backgroundElement: "rgb(var(--background-element) / <alpha-value>)",
        backgroundSelected: "rgb(var(--background-selected) / <alpha-value>)",
        textPrimary: "rgb(var(--text-primary) / <alpha-value>)",
        textSecondary: "rgb(var(--text-secondary) / <alpha-value>)",
        textMuted: "rgb(var(--text-muted) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        accentLight: "rgb(var(--accentLight) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        cardBackground: "rgb(var(--card-background) / <alpha-value>)",
        lightBackground: "rgb(var(--lightBackground) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",

         
        },
      
    },
  },
  plugins: [],
}
