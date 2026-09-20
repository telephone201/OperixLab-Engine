/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        operix: {
          background: '#0f172a', // slate-900
          surface: '#1e293b',    // slate-800
          primary: '#3b82f6',    // blue-500
          accent: '#6366f1',     // indigo-500
          text: '#f8fafc',       // slate-50
          muted: '#94a3b8',       // slate-400
        },
      },
    },
  },
  plugins: [],
}
