import 'server-only';
import { randomBytes } from 'node:crypto';

/**
 * Generate a cryptographically random ticket token.
 *
 * 32 bytes of entropy (2^256), encoded as URL-safe base64 (no padding,
 * uses '-' and '_' instead of '+' and '/'). Roughly 43 characters.
 *
 * The token is the QR payload AND the database lookup key. Self-contained:
 * possessing the token is sufficient to view the ticket (the /ticket/[token]
 * route does a direct lookup). No PII is embedded.
 *
 * Collisions are statistically impossible — even at 1 billion tickets
 * the probability of a collision is ~10^-58.
 */
export function generateTicketToken(): string {
  return randomBytes(32).toString('base64url');
}
