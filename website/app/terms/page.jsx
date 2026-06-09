import TermsOfServicePage from '../../components/terms-of-service';

export const metadata = {
  title: 'Terms of Service',
  description:
    'StrydeOS terms of service. Subscription terms, billing, data protection, and liability for our clinical performance platform.',
  alternates: { canonical: '/terms' },
  openGraph: {
    title: 'Terms of Service | StrydeOS',
    description:
      'StrydeOS terms of service. Subscription terms, billing, data protection, and liability for our clinical performance platform.',
    url: 'https://strydeos.com/terms',
    images: ['/brand/og-card.png'],
  },
};

export default function Page() {
  return <TermsOfServicePage />;
}
