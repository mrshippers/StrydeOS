import IntelligencePage from '../../components/intelligence';

export const metadata = {
  title: 'Intelligence — Clinical Performance Dashboard',
  description:
    'Know how your clinic actually performs. Track follow-up conversion, HEP compliance, utilisation, and DNA rate per clinician.',
  openGraph: {
    title: 'Intelligence — Clinical Performance Dashboard | StrydeOS',
    description:
      'Know how your clinic actually performs. Track follow-up conversion, HEP compliance, utilisation, and DNA rate per clinician.',
    url: 'https://strydeos.com/intelligence',
  },
};

export default function Page() {
  return <IntelligencePage />;
}
