import RoiCalculator from '../../components/roi-calculator';

export const metadata = {
  title: 'ROI Calculator - What missed calls cost your clinic | StrydeOS',
  description:
    'See what unanswered calls are costing your physio clinic, and what Ava recovers every month. Free, instant, no sign-up.',
  alternates: { canonical: '/roi-calculator' },
  openGraph: {
    title: 'What are missed calls costing your clinic? | StrydeOS',
    description:
      'Move the sliders to your numbers and see the revenue Ava recovers every month. Free ROI calculator for private physio clinics.',
    url: 'https://strydeos.com/roi-calculator',
    images: ['/brand/og-card.png'],
  },
};

/* Crawlable Q&A - also emitted as FAQPage schema below so it can win rich results. */
const FAQ = [
  {
    q: 'How much do missed calls cost a physiotherapy clinic?',
    a: "More than most owners realise. UK allied-health clinics miss roughly a fifth to a third of inbound calls, mostly after hours, at lunch, or while the front desk is already on the line. Each missed new-patient call is a booking that goes to the next clinic on Google. For a clinic taking 40 calls a week at a £70 first-appointment fee, that is commonly several thousand pounds of recoverable revenue a year. Use the calculator above with your own numbers to size it.",
  },
  {
    q: 'What does an AI voice receptionist for a physio clinic cost?',
    a: 'Ava, the StrydeOS AI voice receptionist, is £99/month for a solo practitioner, £149/month for a studio of two to five clinicians, and £199/month for a clinic of six or more. There is a one-time £195 setup for phone provisioning and voice training when Ava is taken on its own, and that setup is waived on the Full Stack bundle. No lock-in contracts at any tier.',
  },
  {
    q: 'How does Ava actually book patients into my diary?',
    a: 'Ava answers the call, works out what the caller needs, checks your live diary for genuine availability, offers a real slot, books it directly into your practice management system, and texts the patient an SMS confirmation. It is the same booking flow a good receptionist runs, available 24/7.',
  },
  {
    q: 'Which practice management systems does Ava work with?',
    a: 'Ava books into Cliniko and WriteUpp today, with further UK physio systems on the roadmap. It writes the confirmed appointment straight into your existing diary, so there is no separate calendar to manage.',
  },
  {
    q: 'Will it replace my answering service?',
    a: 'For most clinics, yes. Ava handles inbound calls round the clock and books them in, which is what an answering or call-handling service does, except it also writes to your diary and texts confirmations. Clinics that switch typically stop a £400 to £800 monthly call-handling bill. Set that figure in the calculator to see the combined return.',
  },
];

const C = { cream: '#FAF9F7', navy: '#0B2545', ink: '#111827', muted: '#6B7280', blue: '#1C54F2', border: '#E2DFDA' };

export default function Page() {
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  return (
    <>
      <RoiCalculator />

      {/* Indexable explainer + FAQ - gives the page real crawlable text to rank on */}
      <section style={{ background: C.cream, fontFamily: "'Outfit',sans-serif", color: C.ink, padding: '8px 24px 96px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 56 }}>
            <h2 style={{ fontFamily: "'DM Serif Display',serif", fontWeight: 400, fontSize: 'clamp(26px,4vw,36px)', color: C.navy, lineHeight: 1.15, margin: '0 0 18px' }}>
              The real cost of a missed call
            </h2>
            <p style={{ fontSize: 16.5, color: C.muted, lineHeight: 1.7, margin: '0 0 16px' }}>
              In private physiotherapy, the first phone call is where the patient relationship is won or lost. When that call goes unanswered, the caller rarely leaves a voicemail. They dial the next clinic on the search results, book there, and you never know the enquiry existed. The loss is invisible, which is exactly why it goes unmanaged for years.
            </p>
            <p style={{ fontSize: 16.5, color: C.muted, lineHeight: 1.7, margin: '0 0 16px' }}>
              The calculator above models that leakage conservatively: how many calls you take, the share you miss, the proportion of answered new-patient enquiries that convert, and what a new patient is worth. It assumes Ava recovers 70% of the calls you currently miss, on the basis that some callers hang up before any receptionist could pick up. The number it returns is the revenue a 24/7 AI receptionist puts back on the table each month.
            </p>
          </div>

          <div style={{ marginTop: 48 }}>
            <h2 style={{ fontFamily: "'DM Serif Display',serif", fontWeight: 400, fontSize: 'clamp(24px,3.5vw,32px)', color: C.navy, lineHeight: 1.15, margin: '0 0 24px' }}>
              Frequently asked questions
            </h2>
            <div>
              {FAQ.map(({ q, a }) => (
                <div key={q} style={{ borderTop: `1px solid ${C.border}`, padding: '22px 0' }}>
                  <h3 style={{ fontSize: 17, fontWeight: 700, color: C.navy, margin: '0 0 8px', lineHeight: 1.35 }}>{q}</h3>
                  <p style={{ fontSize: 15.5, color: C.muted, lineHeight: 1.65, margin: 0 }}>{a}</p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: 48 }}>
            <a href="https://portal.strydeos.com/trial?src=roi-faq" target="_blank" rel="noopener" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '15px 32px', borderRadius: 50,
              background: `linear-gradient(135deg,#2E6BFF,${C.blue})`, color: 'white', textDecoration: 'none',
              fontWeight: 700, fontSize: 15, boxShadow: '0 4px 18px rgba(28,84,242,0.32)',
            }}>Start your free trial <span style={{ fontSize: 17 }}>{'→'}</span></a>
          </div>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
    </>
  );
}
