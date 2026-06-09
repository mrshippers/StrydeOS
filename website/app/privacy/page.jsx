import PrivacyPolicyPage from '../../components/privacy-policy';

export const metadata = {
  title: 'Privacy Policy',
  description:
    'StrydeOS privacy policy. How we collect, use, retain, and protect personal data for private practice clinics.',
  alternates: { canonical: '/privacy' },
  openGraph: {
    title: 'Privacy Policy | StrydeOS',
    description:
      'StrydeOS privacy policy. How we collect, use, retain, and protect personal data for private practice clinics.',
    url: 'https://strydeos.com/privacy',
    images: ['/brand/og-card.png'],
  },
};

export default function Page() {
  return <PrivacyPolicyPage />;
}
