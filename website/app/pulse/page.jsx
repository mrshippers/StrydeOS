import PulsePage from '../../components/pulse';

export const metadata = {
  title: 'Pulse - Patient Retention Engine',
  description:
    'Keep patients in care, longer. Pulse automates every touchpoint between sessions and adapts based on clinical context.',
  alternates: { canonical: '/pulse' },
  openGraph: {
    title: 'Pulse - Patient Retention Engine | StrydeOS',
    description:
      'Keep patients in care, longer. Pulse automates every touchpoint between sessions and adapts based on clinical context.',
    url: 'https://strydeos.com/pulse',
    images: ['/brand/og-card.png'],
  },
};

export default function Page() {
  return <PulsePage />;
}
