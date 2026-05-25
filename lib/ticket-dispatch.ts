import 'server-only';
import {
  getTicketsByOrderId,
  markTicketsEmailSent,
  type TicketRow,
} from './db-admin';
import { generateQRBuffer } from './qr';
import { generateTicketPDF } from './ticket-pdf';
import { renderTicketEmail } from './ticket-email';
import { sendEmail } from './email';

/**
 * Build + send a ticket confirmation email for every ticket sharing a
 * shopify_order_id (or synthetic 'comp:<group_uuid>' for admin-issued
 * comps), and stamp each ticket row with email_sent_at + resend_email_id.
 *
 * Mirrors exactly the paid-purchase flow that lives inside the webhook
 * route (PR #11/#13/#18 dispatchTicketEmail). The webhook still keeps its
 * inline version untouched per PR #20 spec #8 ("no webhook changes"); this
 * module is the same orchestration extracted so the admin /api/admin/comp
 * endpoint can reuse the path without duplicating the QR/PDF/Resend wiring.
 *
 * Paid combo → 1 email with 2 QR cards + 2-page PDF.
 * Comp combo (admin) → SAME shape: synthetic order id binds the 2 rows
 *                      together, getTicketsByOrderId returns both, email
 *                      renders both inline.
 */
export async function dispatchTicketEmailForOrder(args: {
  shopifyOrderId: string;
  buyerEmail: string;
  buyerFirstName: string;
}): Promise<{ sent: boolean; resendEmailId?: string }> {
  const tickets = await getTicketsByOrderId(args.shopifyOrderId);
  if (tickets.length === 0) return { sent: false };

  const qrBuffers = await Promise.all(
    tickets.map((t) => generateQRBuffer(t.token, { size: 480, margin: 1 })),
  );

  const emailTickets = tickets.map((t, i) => ({
    token: t.token,
    ticket_type: t.ticket_type,
    event: t.event,
    holder_name: t.holder_name,
    team_slug: t.team_slug,
    jersey_size: t.jersey_size,
    shorts_size: t.shorts_size,
    age_group: t.age_group,
    guardian_name: t.guardian_name,
    qrBuffer: qrBuffers[i],
  }));

  const { subject, html, text, inlineAttachments } = renderTicketEmail(
    {
      buyer_first_name: args.buyerFirstName,
      shopify_order_number: tickets[0]?.shopify_order_number ?? null,
    },
    emailTickets,
  );

  const pdfBuffer = await generateTicketPDF(
    tickets.map((t: TicketRow) => ({
      token: t.token,
      shopify_order_number: t.shopify_order_number,
      ticket_type: t.ticket_type,
      event: t.event,
      holder_name: t.holder_name,
      team_slug: t.team_slug,
      jersey_size: t.jersey_size,
      shorts_size: t.shorts_size,
      age_group: t.age_group,
      guardian_name: t.guardian_name,
    })),
  );

  const { id: resendEmailId } = await sendEmail({
    to: args.buyerEmail,
    subject,
    html,
    text,
    attachments: [
      ...inlineAttachments,
      {
        filename: 'phamily-classic-tickets.pdf',
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });

  await markTicketsEmailSent(
    tickets.map((t) => t.id),
    resendEmailId,
  );

  return { sent: true, resendEmailId };
}
