import TermsOfServicePage from '../../components/terms-of-service';

export const metadata = {
  title: 'Terms of Service',
  description:
    'StrydeOS terms of service. Subscription terms, billing, data protection, and liability for our clinical performance platform.',
  openGraph: {
    title: 'Terms of Service | StrydeOS',
    description:
      'StrydeOS terms of service. Subscription terms, billing, data protection, and liability for our clinical performance platform.',
    url: 'https://strydeos.com/terms',
  },
};

export default function Page() {
  return <TermsOfServicePage />;
}
