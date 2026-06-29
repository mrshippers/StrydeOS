export const metadata = {
  metadataBase: new URL('https://strydeos.com'),
  title: {
    default: 'StrydeOS - The Clinic OS for Private Practice',
    template: '%s | StrydeOS',
  },
  description:
    'Clinical performance tracking for private physiotherapy practices. Surface the gaps. Coach the clinicians. Grow the clinic.',
  keywords: [
    'clinic management software',
    'private practice analytics',
    'physiotherapy practice software',
    'clinician performance dashboard',
    'patient retention',
    'AI receptionist for clinics',
    'practice management insights',
    'Cliniko integration',
    'WriteUpp integration',
    'physio clinic KPIs',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    url: 'https://strydeos.com',
    siteName: 'StrydeOS',
    title: 'StrydeOS - The Clinic OS for Private Practice',
    description:
      'Clinical performance tracking for private physiotherapy practices. Surface the gaps. Coach the clinicians. Grow the clinic.',
    images: [
      {
        url: '/brand/og-card.png',
        width: 1200,
        height: 630,
        alt: 'StrydeOS - The Clinic OS for private practice.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'StrydeOS - The Clinic OS for Private Practice',
    description:
      'Clinical performance tracking for private physiotherapy practices.',
    images: ['/brand/og-card.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  verification: {
    google: '89kPpsA8XhAnER1AlE-8gIqx3q6CS7by1BoZEmAFRSc',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#06182e',
};

const organizationLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'StrydeOS',
  url: 'https://strydeos.com',
  logo: 'https://strydeos.com/brand/logo-mark.png',
  description:
    'The clinic operating system for private practice. Clinical performance tracking, an AI voice receptionist, and patient retention automation that sit above your PMS.',
  email: 'hello@strydeos.com',
  areaServed: 'GB',
};

const softwareLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'StrydeOS',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: 'https://strydeos.com',
  description:
    'Clinical performance tracking, an AI voice receptionist (Ava), and patient retention automation (Pulse) for private physiotherapy clinics. Connects to Cliniko, WriteUpp and more.',
  offers: {
    '@type': 'Offer',
    price: '129',
    priceCurrency: 'GBP',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-GB">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareLd) }}
        />
        {children}
      </body>
    </html>
  );
}
