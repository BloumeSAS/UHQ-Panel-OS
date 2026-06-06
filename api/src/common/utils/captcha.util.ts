import { request } from 'undici';

export type CaptchaProvider = 'none' | 'hcaptcha' | 'recaptcha' | 'turnstile' | 'cap';

const VERIFY_URLS: Record<string, string> = {
  hcaptcha: 'https://hcaptcha.com/siteverify',
  recaptcha: 'https://www.google.com/recaptcha/api/siteverify',
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
};

/**
 * Vérifie un token captcha côté serveur.
 * Renvoie true si la vérification réussit ou si le captcha est désactivé.
 *
 * CAP (trycap) est open-source : l'endpoint est auto-hébergé.
 * URL : <capEndpoint>/<siteKey>/siteverify  — corps JSON { secret, response }
 */
export async function verifyCaptcha(
  provider: CaptchaProvider,
  secretKey: string,
  token: string | undefined,
  opts?: { siteKey?: string; capEndpoint?: string },
): Promise<boolean> {
  if (provider === 'none' || !secretKey) return true;
  if (!token) return false;

  try {
    if (provider === 'cap') {
      // CAP : endpoint configurable + JSON body
      const base = opts?.capEndpoint?.replace(/\/$/, '') || 'https://cap.trycap.dev';
      const siteKey = opts?.siteKey || '';
      const url = `${base}/${siteKey}/siteverify`;
      const { statusCode, body } = await request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: secretKey, response: token }),
      });
      if (statusCode < 200 || statusCode >= 300) return false;
      const json: any = await body.json();
      return json.success === true;
    }

    // hCaptcha / reCAPTCHA / Turnstile : URL fixe + form-urlencoded
    const url = VERIFY_URLS[provider];
    if (!url) return true;
    const formBody = new URLSearchParams({ secret: secretKey, response: token });
    const { statusCode, body } = await request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
    });
    if (statusCode < 200 || statusCode >= 300) return false;
    const json: any = await body.json();
    return json.success === true;
  } catch {
    return false;
  }
}
