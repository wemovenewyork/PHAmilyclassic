import { Resend } from 'resend';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
}

/**
 * Send a transactional email via Resend.
 *
 * Reads RESEND_API_KEY, RESEND_FROM_EMAIL, RESEND_REPLY_TO from the
 * environment at call time so missing config surfaces at the request
 * boundary instead of at module load.
 *
 * Returns the Resend-assigned email id on success. Throws with a
 * descriptive message on any failure (missing config, Resend API
 * error, malformed response) so logs are actionable.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  attachments,
}: SendEmailParams): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const replyTo = process.env.RESEND_REPLY_TO;

  if (!apiKey) throw new Error('Resend not configured: missing RESEND_API_KEY');
  if (!from) throw new Error('Resend not configured: missing RESEND_FROM_EMAIL');
  if (!replyTo) throw new Error('Resend not configured: missing RESEND_REPLY_TO');

  const resend = new Resend(apiKey);

  const result = await resend.emails.send({
    from,
    replyTo,
    to,
    subject,
    html,
    text,
    attachments: attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });

  if (result.error) {
    throw new Error(`Resend send failed: ${result.error.message}`);
  }
  if (!result.data?.id) {
    throw new Error('Resend send returned no email id');
  }
  return { id: result.data.id };
}
