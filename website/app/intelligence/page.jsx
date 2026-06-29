import IntelligencePage from '../../components/intelligence';

export const metadata = {
  title: 'Intelligence - Clinical Performance Dashboard',
  description:
    'Know how your clinic actually performs. Track follow-up conversion, HEP compliance, utilisation, and DNA rate per clinician.',
  alternates: { canonical: '/intelligence' },
  openGraph: {
    title: 'Intelligence - Clinical Performance Dashboard | StrydeOS',
    description:
      'Know how your clinic actually performs. Track follow-up conversion, HEP compliance, utilisation, and DNA rate per clinician.',
    url: 'https://strydeos.com/intelligence',
    images: ['/brand/og-card.png'],
  },
};

export default function Page() {
  return <IntelligencePage />;
}
