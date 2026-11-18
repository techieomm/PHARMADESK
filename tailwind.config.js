/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#FAF7F0',
          100: '#F5F0E6',
          200: '#EBE2D0',
          300: '#E1D4BA',
        },
        charcoal: {
          900: '#1F1F1F',
          800: '#292929',
          700: '#3D3D3D',
          600: '#525252',
          500: '#737373',
          400: '#A3A3A3',
          300: '#D4D4D4',
          200: '#E5E5E5',
          100: '#F5F5F5',
        },
        brand: {
          50: '#FDF8F3',
          100: '#FBF0E7',
          200: '#F5DCC8',
          300: '#EFC8A9',
          400: '#E9A66B', // Main Light Orange accent
          500: '#DE8E48',
          600: '#C7752F',
          700: '#A3581E',
          800: '#7F4116',
          900: '#5C2D0F',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          subtle: '#FAF7F0',
          muted: '#F8F9FA',
          border: '#E5E7EB',
          'border-strong': '#D1D5DB',
        }
      },
      fontFamily: {
        sans: ['Inter', 'DM Sans', 'Manrope', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
