type EmailAttachment = {
  name: string;
  content: string;
};

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
  attachments?: EmailAttachment[];
};

function sender() {
  const value = process.env.EMAIL_FROM?.trim() ?? '';
  const named = value.match(/^(.+?)\s*<([^<>]+)>$/);
  const name = named?.[1]?.trim().replace(/^['"]|['"]$/g, '') || 'Roomie';
  const email = (named?.[2] ?? value).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('EMAIL_FROM must be a valid Brevo sender email');
  return { name, email };
}

export function emailProviderConfigured() {
  if (!process.env.BREVO_API_KEY || !process.env.EMAIL_FROM) return false;
  try { sender(); return true; } catch { return false; }
}

export async function sendEmail(input: SendEmailInput) {
  const response = await fetch(`${process.env.BREVO_BASE_URL || 'https://api.brevo.com'}/v3/smtp/email`, {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    headers: {
      accept: 'application/json',
      'api-key': process.env.BREVO_API_KEY!,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: sender(),
      to: [{ email: input.to }],
      subject: input.subject,
      textContent: input.text,
      htmlContent: input.html,
      // Brevo uses this message header to deduplicate transactional sends.
      headers: { IdempotencyKey: input.idempotencyKey },
      ...(input.attachments?.length ? { attachment: input.attachments } : {}),
    }),
  });
  if (!response.ok) throw new Error(`Brevo ${response.status}: ${(await response.text()).slice(0, 240)}`);
  const result = await response.json() as { messageId?: string };
  return result.messageId ?? null;
}
