import AvaPage from '../../components/ava';

export const metadata = {
  title: 'Ava — AI Voice Receptionist',
  description:
    'Never miss a patient again. Ava handles inbound calls, books into your diary, and recovers cancellations automatically.',
  openGraph: {
    title: 'Ava — AI Voice Receptionist | StrydeOS',
    description:
      'Never miss a patient again. Ava handles inbound calls, books into your diary, and recovers cancellations automatically.',
    url: 'https://strydeos.com/ava',
  },
};

export default function Page() {
  return <AvaPage />;
}
