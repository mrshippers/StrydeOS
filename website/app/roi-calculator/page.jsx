import RoiCalculator from '../../components/roi-calculator';

export const metadata = {
  title: 'ROI Calculator — What missed calls cost your clinic | StrydeOS',
  description:
    'See what unanswered calls are costing your physio clinic, and what Ava recovers every month. Free, instant, no sign-up.',
  alternates: { canonical: '/roi-calculator' },
  openGraph: {
    title: 'What are missed calls costing your clinic? | StrydeOS',
    description:
      'Move the sliders to your numbers and see the revenue Ava recovers every month. Free ROI calculator for private physio clinics.',
    url: 'https://strydeos.com/roi-calculator',
    images: ['/brand/og-card.png'],
  },
};

export default function Page() {
  return <RoiCalculator />;
}
