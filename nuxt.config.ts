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
    'nuxt-auth-utils',
  ],
  css: ['~/assets/css/main.css'],
  nitro: {
    experimental: {
      tasks: true,
    },
    scheduledTasks: {
      // Run cost collection daily at 06:00 UTC
      '0 6 * * *': ['collect'],
    },
  },
  runtimeConfig: {
    allowedEmails: process.env.ALLOWED_EMAILS || '',
    session: {
      password: process.env.NUXT_SESSION_PASSWORD || '',
    },
    oauth: {
      google: {
        clientId: process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.NUXT_OAUTH_GOOGLE_CLIENT_SECRET || '',
      },
    },
    databaseUrl: process.env.DATABASE_URL || '',
    anthropicAdminApiKey: process.env.ANTHROPIC_ADMIN_API_KEY || '',
    railwayApiToken: process.env.RAILWAY_API_TOKEN || '',
    renderApiKey: process.env.RENDER_API_KEY || '',
    resendApiKey: process.env.RESEND_API_KEY || '',
    neonApiKey: process.env.NEON_API_KEY || '',
    tursoApiToken: process.env.TURSO_API_TOKEN || '',
    uptimeRobotApiKey: process.env.UPTIMEROBOT_API_KEY || '',
    whatsappPhone: process.env.WHATSAPP_PHONE || '',
    whatsappApikey: process.env.WHATSAPP_APIKEY || '',
    public: {
      eurUsdRate: 0.92, // EUR per 1 USD — update monthly
    },
  },
})
