import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendAlertEmail, sendWhatsApp } from '../server/utils/notifications'

describe('sendAlertEmail', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('skips when resendApiKey is missing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await sendAlertEmail('test', 'warning', 'Test Subject', {})
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sends email with correct payload', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }))
    await sendAlertEmail('Budget exceeded', 'critical', 'Budget Alert', { resendApiKey: 'test-key' })

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, options] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(options?.method).toBe('POST')
    expect(options?.headers).toEqual({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-key',
    })
    const body = JSON.parse(options?.body as string)
    expect(body.from).toBe('InfraCost <alerts@contactrefiner.com>')
    expect(body.to).toEqual(['peterfusek1980@gmail.com'])
    expect(body.subject).toBe('[InfraCost CRITICAL] Budget Alert')
    expect(body.text).toBe('Budget exceeded')
  })

  it('handles fetch errors gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await sendAlertEmail('test', 'warning', 'Test', { resendApiKey: 'key' })
    expect(consoleSpy).toHaveBeenCalledWith('[notifications] Email send failed:', 'network error')
  })

  it('logs non-ok responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('rate limited', { status: 429 }))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await sendAlertEmail('test', 'warning', 'Test', { resendApiKey: 'key' })
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('429'))
  })
})

describe('sendWhatsApp', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('skips when phone is missing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await sendWhatsApp('test', { whatsappApikey: 'key' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('skips when apikey is missing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await sendWhatsApp('test', { whatsappPhone: '123' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sends WhatsApp with URL-encoded message', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }))
    await sendWhatsApp('Hello World!', { whatsappPhone: '421900123', whatsappApikey: 'abc123' })

    expect(fetchSpy).toHaveBeenCalledOnce()
    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toContain('phone=421900123')
    expect(url).toContain('apikey=abc123')
    expect(url).toContain('text=Hello%20World!')
  })

  it('handles fetch errors gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await sendWhatsApp('test', { whatsappPhone: '123', whatsappApikey: 'key' })
    expect(consoleSpy).toHaveBeenCalledWith('[notifications] WhatsApp send failed:', 'timeout')
  })
})
