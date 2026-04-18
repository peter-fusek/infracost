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
  app: {
    head: {
      link: [
        { rel: 'canonical', href: 'https://infracost.eu' },
      ],
      script: process.env.NUXT_PUBLIC_GA_ID ? [
        { src: `https://www.googletagmanager.com/gtag/js?id=${process.env.NUXT_PUBLIC_GA_ID}`, async: true },
        { innerHTML: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${process.env.NUXT_PUBLIC_GA_ID}')` },
      ] : [],
    },
  },
  nitro: {
    experimental: {
      tasks: true,
    },
    routeRules: {
      '/**': {
        headers: {
          'X-Frame-Options': 'DENY',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
          'Content-Security-Policy': [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https:",
            "font-src 'self' data:",
            "connect-src 'self' https://www.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
            "frame-ancestors 'none'",
            "upgrade-insecure-requests",
          ].join('; '),
        },
      },
    },
    scheduledTasks: {
      // Source reconciliation runs before collect so drift is surfaced
      // independently of whether any collector errors out (#94).
      '30 5 * * *': ['source-drift'],
      // Run cost collection daily at 06:00 UTC
      '0 6 * * *': ['collect'],
      // Weekly cost digest email — Mondays at 07:00 UTC
      '0 7 * * 1': ['weekly-digest'],
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
    githubToken: process.env.GITHUB_TOKEN || '',
    gcpServiceAccountJson: process.env.GCP_SERVICE_ACCOUNT_JSON || '',
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
    alertFromEmail: process.env.ALERT_FROM_EMAIL || '',
    alertToEmail: process.env.ALERT_TO_EMAIL || '',
    public: {
      eurUsdRate: 0.87, // EUR per 1 USD — update monthly
    },
  },
})
