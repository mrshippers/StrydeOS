import AvaPage from '../../components/ava';

export const metadata = {
  title: 'Ava - AI Voice Receptionist',
  description:
    'Never miss a patient again. Ava handles inbound calls, books into your diary, and recovers cancellations automatically.',
  alternates: { canonical: '/ava' },
  openGraph: {
    title: 'Ava - AI Voice Receptionist | StrydeOS',
    description:
      'Never miss a patient again. Ava handles inbound calls, books into your diary, and recovers cancellations automatically.',
    url: 'https://strydeos.com/ava',
    images: ['/brand/og-card.png'],
  },
};

export default function Page() {
  return <AvaPage />;
}
