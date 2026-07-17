import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Status/role colours defined once so tables, badges and the org tree
        // agree on what "inactive" looks like.
        status: {
          active: '#16a34a',
          inactive: '#a1a1aa',
          deleted: '#dc2626',
        },
      },
    },
  },
  plugins: [],
};

export default config;
