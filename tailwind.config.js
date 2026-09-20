/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#e9ebef',
        pane: '#ffffff',
        side: '#f6f7f9',
        line: '#ececf1',
        'line-soft': '#f3f4f7',
        ink: {
          DEFAULT: '#1f2328',
          soft: '#5b6270',
          mute: '#9aa0ab',
          faint: '#c2c6cf'
        },
        accent: {
          DEFAULT: '#4f6ef7',
          bg: '#eaeefd',
          soft: '#dfe6fc',
          ink: '#3b57d6'
        },
        hi: '#e2483d',
        mid: '#f59f0a',
        lo: '#3b82f6',
        good: '#34c759'
      },
      borderRadius: {
        xl2: '14px'
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04), 0 6px 20px rgba(16,24,40,.05)',
        pop: '0 10px 30px rgba(16,24,40,.14)'
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'PingFang SC',
          'Hiragino Sans GB',
          'Microsoft YaHei',
          'system-ui',
          'sans-serif'
        ]
      }
    }
  },
  plugins: []
};
