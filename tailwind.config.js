/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Same crimson brand as the public app and the admin console — a
        // provider who has seen the tenant app should recognise this one.
        brandRed: '#ba0036',
        crimson: {
          50: '#FDF2F5',
          100: '#FBE5EB',
          500: '#ba0036',
          600: '#90002A',
          800: '#60001C',
          900: '#400013',
        },
        emerald: {
          50: '#ECF7F2',
          100: '#CDE8DB',
          500: '#1B8553',
          600: '#136B41',
          800: '#0A4529',
        },
        slate: {
          50: '#F8F9FA',
          200: '#E5E7EB',
          600: '#4B5563',
          800: '#1F2937',
          900: '#111827',
        },
      },
      fontFamily: {
        // Bengali first: Hind Siliguri renders যুক্তাক্ষর correctly where Inter
        // falls back to a system font that often does not. Inter follows for
        // the Latin digits and the occasional English string.
        sans: ['"Hind Siliguri"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // The floor is deliberately higher than the other two apps'. This
        // audience skews older and reads on a cheap screen in daylight; the
        // usual 11px chrome text is unreadable there.
        'xs': ['0.8125rem', { lineHeight: '1.15rem' }],
        'sm': ['0.9375rem', { lineHeight: '1.35rem' }],
      },
      minHeight: {
        // Every interactive control clears this. A miss-tap on an accept button
        // costs a provider a real order.
        'tap': '52px',
      },
    },
  },
  plugins: [],
}
