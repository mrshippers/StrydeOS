export const metadata = {
  metadataBase: new URL('https://strydeos.com'),
  title: {
    default: 'StrydeOS — The Clinic OS for Private Practice',
    template: '%s | StrydeOS',
  },
  description:
    'Clinical performance tracking for private physiotherapy practices. Surface the gaps. Coach the clinicians. Grow the clinic.',
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    url: 'https://strydeos.com',
    siteName: 'StrydeOS',
    title: 'StrydeOS — The Clinic OS for Private Practice',
    description:
      'Clinical performance tracking for private physiotherapy practices. Surface the gaps. Coach the clinicians. Grow the clinic.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'StrydeOS — The Clinic OS for Private Practice',
    description:
      'Clinical performance tracking for private physiotherapy practices.',
  },
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
