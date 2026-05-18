import { ImageResponse } from 'next/og';

export const alt =
  'The 1st Annual Interstate PHAmily Classic — NY vs NJ Basketball & Kickball — August 29, 2026 at Riverbank State Park, NYC. Presented by Adelphic Union Lodge #14.';

export const size = { width: 1200, height: 630 };

export const contentType = 'image/png';

const GOLD = '#f5c518';
const NAVY = '#0a1628';
const WHITE = '#ffffff';
const GRAY = '#94a3b8';

const FONT_STACK =
  "system-ui, -apple-system, 'Segoe UI', sans-serif";

// If radial gradients don't render in Satori on your Vercel runtime, swap
// `background` on the root <div> with:
//   background: 'linear-gradient(180deg, #132244 0%, #0a1628 100%)'
const BACKGROUND =
  `radial-gradient(ellipse at top left, rgba(30,58,110,0.6) 0%, transparent 60%),` +
  `radial-gradient(ellipse at bottom right, rgba(196,30,42,0.25) 0%, transparent 50%),` +
  `${NAVY}`;

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: BACKGROUND,
          fontFamily: FONT_STACK,
        }}
      >
        {/* Top gold accent bar */}
        <div style={{ width: '100%', height: 4, background: GOLD, display: 'flex' }} />

        {/* Padded body */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'flex-start',
            padding: 80,
          }}
        >
          {/* Top small-caps label */}
          <div
            style={{
              display: 'flex',
              color: GOLD,
              fontSize: 22,
              letterSpacing: 4,
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            PRESENTED BY ADELPHIC UNION LODGE #14
          </div>

          {/* Main title — three lines */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              marginTop: 18,
            }}
          >
            <div
              style={{
                display: 'flex',
                color: WHITE,
                fontSize: 48,
                fontWeight: 600,
                letterSpacing: 2,
                textTransform: 'uppercase',
              }}
            >
              THE 1ST ANNUAL
            </div>
            <div
              style={{
                display: 'flex',
                color: WHITE,
                fontSize: 110,
                fontWeight: 700,
                lineHeight: 0.95,
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              INTERSTATE
            </div>
            <div
              style={{
                display: 'flex',
                color: GOLD,
                fontSize: 110,
                fontWeight: 700,
                lineHeight: 0.95,
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              PHAMILY CLASSIC
            </div>
          </div>

          {/* Tagline */}
          <div
            style={{
              display: 'flex',
              color: GRAY,
              fontSize: 32,
              letterSpacing: 3,
              marginTop: 40,
            }}
          >
            NY vs NJ  •  Basketball  •  Kickball  •  Community
          </div>

          {/* Bottom row: DATE | LOCATION */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              marginTop: 60,
              gap: 40,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div
                style={{
                  display: 'flex',
                  color: GOLD,
                  fontSize: 18,
                  letterSpacing: 3,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}
              >
                DATE
              </div>
              <div
                style={{
                  display: 'flex',
                  color: WHITE,
                  fontSize: 36,
                  fontWeight: 700,
                  marginTop: 8,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                AUG 29, 2026
              </div>
            </div>

            {/* Thin gold vertical separator */}
            <div style={{ width: 2, height: 64, background: GOLD, display: 'flex' }} />

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div
                style={{
                  display: 'flex',
                  color: GOLD,
                  fontSize: 18,
                  letterSpacing: 3,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}
              >
                LOCATION
              </div>
              <div
                style={{
                  display: 'flex',
                  color: WHITE,
                  fontSize: 36,
                  fontWeight: 700,
                  marginTop: 8,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                RIVERBANK STATE PARK, NYC
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
