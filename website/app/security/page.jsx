import SecurityPolicyPage from '../../components/security-policy';

export const metadata = {
  title: 'Security Policy',
  description:
    'StrydeOS data handling and security policy. UK-hosted, encrypted, role-based access, and GDPR compliant.',
  alternates: { canonical: '/security' },
  openGraph: {
    title: 'Security Policy | StrydeOS',
    description:
      'StrydeOS data handling and security policy. UK-hosted, encrypted, role-based access, and GDPR compliant.',
    url: 'https://strydeos.com/security',
    images: ['/brand/og-card.png'],
  },
};

export default function Page() {
  return <SecurityPolicyPage />;
}
