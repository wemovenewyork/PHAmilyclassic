import 'server-only';
import QRCode from 'qrcode';

/**
 * QR code generation for ticket tokens.
 *
 * Encodes the FULL URL of the hosted ticket page, not just the token.
 * That way any phone camera can scan the QR and land on the ticket
 * — no special scanner app required. Our scanner UI (PR 3) will
 * extract the token from the URL.
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
  'https://theinterstatephamilyclassic.org';

interface QROptions {
  size?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  margin?: number;
}

function ticketUrl(token: string): string {
  return `${SITE_URL}/ticket/${token}`;
}

/**
 * Generate a data URL ("data:image/png;base64,...") for inline embedding
 * in HTML emails or rendered into a Next.js <img src>.
 */
export async function generateQRDataUrl(
  token: string,
  options: QROptions = {},
): Promise<string> {
  return QRCode.toDataURL(ticketUrl(token), {
    width: options.size ?? 400,
    errorCorrectionLevel: options.errorCorrectionLevel ?? 'M',
    margin: options.margin ?? 1,
  });
}

/**
 * Generate a raw PNG buffer for embedding in PDFs.
 */
export async function generateQRBuffer(
  token: string,
  options: QROptions = {},
): Promise<Buffer> {
  return QRCode.toBuffer(ticketUrl(token), {
    width: options.size ?? 400,
    errorCorrectionLevel: options.errorCorrectionLevel ?? 'M',
    margin: options.margin ?? 1,
  });
}
