/**
 * Shared notification helpers for email (Resend) and WhatsApp (CallMeBot).
 * Used by budget-alerts and plan-limit-alerts services.
 */

export async function sendAlertEmail(message: string, severity: string, subject: string, config: Record<string, string>) {
  if (!config.resendApiKey) return
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.resendApiKey}`,
      },
      body: JSON.stringify({
        from: config.alertFromEmail || 'InfraCost <alerts@contactrefiner.com>',
        to: [config.alertToEmail || 'peterfusek1980@gmail.com'],
        subject: `[InfraCost ${severity.toUpperCase()}] ${subject}`,
        text: message,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      console.error(`[notifications] Email send returned ${response.status}: ${await response.text()}`)
    }
  }
  catch (err) {
    console.error('[notifications] Email send failed:', err instanceof Error ? err.message : err)
  }
}

export async function sendWhatsApp(message: string, config: Record<string, string>) {
  const phone = config.whatsappPhone
  const apikey = config.whatsappApikey
  if (!phone || !apikey) return
  try {
    const encoded = encodeURIComponent(message)
    const response = await fetch(`https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encoded}&apikey=${apikey}`, {
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      console.error(`[notifications] WhatsApp send returned ${response.status}: ${await response.text()}`)
    }
  }
  catch (err) {
    console.error('[notifications] WhatsApp send failed:', err instanceof Error ? err.message : err)
  }
}
