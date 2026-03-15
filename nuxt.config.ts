// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-03-10',
  devtools: { enabled: true },
  future: {
    compatibilityVersion: 4,
  },
  modules: [
    '@nuxt/ui',
    '@nuxt/eslint',
  ],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL || '',
    anthropicAdminApiKey: process.env.ANTHROPIC_ADMIN_API_KEY || '',
    railwayApiToken: process.env.RAILWAY_API_TOKEN || '',
    renderApiKey: process.env.RENDER_API_KEY || '',
    public: {
      eurUsdRate: 0.92, // EUR per 1 USD — update monthly
    },
  },
})
