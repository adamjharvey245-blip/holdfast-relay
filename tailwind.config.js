/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './src/**/*.{js,ts,jsx,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // HoldFast dark maritime palette
        navy: {
          950: '#04080f',
          900: '#0a1628',
          800: '#0f2040',
          700: '#162d57',
          600: '#1e3a6e',
        },
        anchor: {
          amber: '#f59e0b',
          'amber-bright': '#fbbf24',
          green: '#10b981',
          'green-glow': '#34d399',
          red: '#ef4444',
          'red-glow': '#f87171',
          white: '#f1f5f9',
          dim: '#64748b',
        },
      },
      fontFamily: {
        mono: ['SpaceMono', 'monospace'],
      },
    },
  },
  plugins: [],
};
