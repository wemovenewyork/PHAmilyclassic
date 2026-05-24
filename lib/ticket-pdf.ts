import 'server-only';
import PDFDocument from 'pdfkit';
import { generateQRBuffer } from './qr';
import { getTeamBySlug } from './teams-config';

/**
 * PDF generation for ticket confirmation emails.
 *
 * One page per ticket. Each page renders the QR code, holder info, ticket
 * type, event date/venue, and any team-registration metadata.
 *
 * Implementation notes:
 *   - Uses pdfkit (imperative, lightweight, no React runtime).
 *   - All measurements are in PDF points (72 pt/inch). Letter is 612×792.
 *   - PDFKit's default font (Helvetica) is fine for tickets; embedding the
 *     site's actual fonts would inflate the bundle past Lambda limits.
 *   - We pre-generate QR buffers before starting the doc to keep the
 *     stream-write loop synchronous.
 */

export interface TicketForPDF {
  token: string;
  shopify_order_number: string | null;
  ticket_type: 'team_registration' | 'spectator' | 'after_party' | 'comp';
  event: 'main_event' | 'after_party';
  holder_name: string;
  team_slug: string | null;
  jersey_size: string | null;
  shorts_size: string | null;
  age_group: 'adult' | 'youth' | null;
  guardian_name: string | null;
}

// Brand tokens (mirror lib/ticket-email.ts so PDF + email match)
const NAVY = '#0a1a3a';
const GOLD = '#d4a017';
const TEXT = '#1a1a1a';
const MUTED = '#555555';

// Letter size in points
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54; // 0.75 inch

// Customer-facing ticket label. Drives off the `event` column so the data
// model (`ticket_type` enum) stays unchanged but everyone sees the same
// wording regardless of whether the ticket is team_registration / spectator
// / comp — all main_event tickets are "Basketball Games."
function ticketTypeLabel(t: TicketForPDF): string {
  return t.event === 'after_party'
    ? 'PHAmily Classic — After Party'
    : 'PHAmily Classic — Basketball Games';
}

export async function generateTicketPDF(
  tickets: TicketForPDF[],
): Promise<Buffer> {
  // Pre-generate QR buffers so the PDF stream can be written synchronously.
  const qrBuffers = await Promise.all(
    tickets.map((t) => generateQRBuffer(t.token, { size: 500, margin: 1 })),
  );

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      info: {
        Title: 'Interstate PHAmily Classic — Tickets',
        Author: 'Adelphic Union Lodge #14',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    tickets.forEach((ticket, i) => {
      if (i > 0) doc.addPage();
      renderTicketPage(doc, ticket, qrBuffers[i], i + 1, tickets.length);
    });

    doc.end();
  });
}

function renderTicketPage(
  doc: PDFKit.PDFDocument,
  ticket: TicketForPDF,
  qrBuffer: Buffer,
  index: number,
  total: number,
): void {
  // ----- Header bar -----
  doc.save();
  doc.rect(0, 0, PAGE_W, 90).fill(NAVY);
  doc
    .fillColor(GOLD)
    .font('Helvetica-Bold')
    .fontSize(22)
    .text('INTERSTATE PHAMILY CLASSIC', MARGIN, 30, {
      width: PAGE_W - 2 * MARGIN,
      align: 'center',
      characterSpacing: 2,
    });
  doc
    .fillColor('#cbd5e1')
    .font('Helvetica')
    .fontSize(10)
    .text(`August 29, 2026 · Riverbank State Park, NYC`, MARGIN, 62, {
      width: PAGE_W - 2 * MARGIN,
      align: 'center',
      characterSpacing: 1,
    });
  doc.restore();

  // ----- Ticket of N -----
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(9)
    .text(`Ticket ${index} of ${total}`, MARGIN, 110, {
      width: PAGE_W - 2 * MARGIN,
      align: 'right',
      characterSpacing: 1,
    });

  // ----- Ticket type label (gold) -----
  doc
    .fillColor(GOLD)
    .font('Helvetica-Bold')
    .fontSize(13)
    .text(ticketTypeLabel(ticket), MARGIN, 130, {
      width: PAGE_W - 2 * MARGIN,
      align: 'center',
      characterSpacing: 3,
    });

  // ----- Holder name (large) -----
  doc
    .fillColor(TEXT)
    .font('Helvetica-Bold')
    .fontSize(28)
    .text(ticket.holder_name, MARGIN, 160, {
      width: PAGE_W - 2 * MARGIN,
      align: 'center',
    });

  // ----- QR code (centered, 220 pt) -----
  const QR_SIZE = 220;
  const qrX = (PAGE_W - QR_SIZE) / 2;
  const qrY = 220;
  doc.image(qrBuffer, qrX, qrY, { width: QR_SIZE, height: QR_SIZE });

  // ----- Below QR -----
  doc
    .fillColor(NAVY)
    .font('Helvetica-Bold')
    .fontSize(12)
    .text('SHOW THIS AT THE GATE', MARGIN, qrY + QR_SIZE + 16, {
      width: PAGE_W - 2 * MARGIN,
      align: 'center',
      characterSpacing: 3,
    });

  // ----- Event details (per-type) -----
  let y = qrY + QR_SIZE + 44;
  const centerOpts = { width: PAGE_W - 2 * MARGIN, align: 'center' as const };

  // Date — always the same; bold.
  doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(11);
  doc.text('Saturday, August 29, 2026', MARGIN, y, centerOpts);
  y += 16;

  if (ticket.event === 'after_party') {
    // After-party tickets — Grand Lodge, 9 PM doors. No wristband, no kickball.
    doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXT);
    doc.text('Doors · 9:00 PM', MARGIN, y, centerOpts);
    y += 16;
    doc.font('Helvetica').fontSize(10).fillColor(TEXT);
    doc.text(
      'Most Worshipful Prince Hall Grand Lodge of New York',
      MARGIN,
      y,
      centerOpts,
    );
    y += 14;
    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    doc.text('454 W 155th St, New York, NY 10032', MARGIN, y, centerOpts);
    y += 20;
  } else {
    // Basketball-games tickets — gym doors 3, games 4–7, wristband, kickball context.
    doc.font('Helvetica').fontSize(10).fillColor(MUTED);
    doc.text('Riverbank State Park, NYC', MARGIN, y, centerOpts);
    y += 18;

    doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXT);
    doc.text('Gymnasium Doors Open · 3:00 PM', MARGIN, y, centerOpts);
    y += 14;
    doc.text('Games Run · 4:00 PM – 7:00 PM', MARGIN, y, centerOpts);
    y += 18;

    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    doc.text(
      "After your ticket is scanned at gymnasium entry, you'll receive a wristband for re-entry.",
      MARGIN,
      y,
      centerOpts,
    );
    y += 24;

    doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED);
    doc.text(
      'OES Invitational Kickball — 1:00 PM, outdoors at Riverbank State Park',
      MARGIN,
      y,
      centerOpts,
    );
    y += 22;
  }

  // ----- Team registration metadata -----
  if (ticket.ticket_type === 'team_registration' && ticket.team_slug) {
    const team = getTeamBySlug(ticket.team_slug);
    const teamName = team?.name ?? ticket.team_slug;
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(TEXT)
      .text(`Team: ${teamName}`, MARGIN, y, {
        width: PAGE_W - 2 * MARGIN,
        align: 'center',
      });
    y += 16;
    const sizes: string[] = [];
    if (ticket.jersey_size) sizes.push(`Jersey: ${ticket.jersey_size}`);
    if (ticket.shorts_size) sizes.push(`Shorts: ${ticket.shorts_size}`);
    if (sizes.length) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(MUTED)
        .text(sizes.join(' · '), MARGIN, y, {
          width: PAGE_W - 2 * MARGIN,
          align: 'center',
        });
      y += 18;
    }
  }

  // ----- Youth guardian notice -----
  if (ticket.age_group === 'youth') {
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#c41e2a')
      .text('PARENT OR GUARDIAN MUST ACCOMPANY', MARGIN, y, {
        width: PAGE_W - 2 * MARGIN,
        align: 'center',
        characterSpacing: 1,
      });
    y += 14;
    if (ticket.guardian_name) {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(MUTED)
        .text(`Guardian on file: ${ticket.guardian_name}`, MARGIN, y, {
          width: PAGE_W - 2 * MARGIN,
          align: 'center',
        });
      y += 16;
    }
  }

  // ----- Footer: order number, token tail, terms -----
  const footerY = PAGE_H - MARGIN - 50;
  doc
    .strokeColor('#dddddd')
    .lineWidth(0.5)
    .moveTo(MARGIN, footerY - 10)
    .lineTo(PAGE_W - MARGIN, footerY - 10)
    .stroke();

  const tokenTail = ticket.token.slice(-8);
  const orderLabel = ticket.shopify_order_number
    ? `Order ${ticket.shopify_order_number}`
    : 'Order —';
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(8)
    .text(`${orderLabel}  ·  Ticket ID …${tokenTail}`, MARGIN, footerY, {
      width: PAGE_W - 2 * MARGIN,
      align: 'left',
    });
  doc.text('All sales final. No refunds or exchanges.', MARGIN, footerY, {
    width: PAGE_W - 2 * MARGIN,
    align: 'right',
  });
  doc.text(
    'Presented by Adelphic Union Lodge #14, MWPHGLNY',
    MARGIN,
    footerY + 14,
    {
      width: PAGE_W - 2 * MARGIN,
      align: 'center',
    },
  );
}
