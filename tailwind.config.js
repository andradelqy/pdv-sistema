/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Cores existentes (mantidas)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",

        // 🔵 NOVAS CORES – Identidade Órbita
        'orbita-navy': '#0A2540',
        'orbita-teal': '#00A3C4',
        'orbita-gray-light': '#F3F4F6',
        'orbita-text-dark': '#1F2937',
        'orbita-text-muted': '#6B7280',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      // 🧊 Suporte extra para glassmorphism (backdrop blur)
      backdropBlur: {
        xs: '2px',
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '24px',
        '3xl': '40px',
      },
      // 📐 Tipografia para as páginas de Termos e Privacidade
      typography: (theme) => ({
        DEFAULT: {
          css: {
            color: theme('colors.gray.800'),
            a: {
              color: theme('colors.orbita-teal'),
              '&:hover': {
                color: theme('colors.orbita-navy'),
              },
            },
            h1: {
              color: theme('colors.orbita-navy'),
            },
            h2: {
              color: theme('colors.orbita-navy'),
            },
            strong: {
              color: theme('colors.orbita-navy'),
            },
          },
        },
      }),
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/typography"), // ✅ Plugin para classes prose
  ],
}