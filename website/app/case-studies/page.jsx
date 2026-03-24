import CaseStudiesPage from '../../components/case-studies';

export const metadata = {
  title: 'Case Study — Notting Hill Physio Clinic',
  description:
    'How a Notting Hill physio clinic improved clinician follow-up rate from 1.90 to 2.50 in 6 weeks using StrydeOS Intelligence.',
  openGraph: {
    title: 'Case Study — Notting Hill Physio Clinic | StrydeOS',
    description:
      'How a Notting Hill physio clinic improved clinician follow-up rate from 1.90 to 2.50 in 6 weeks using StrydeOS Intelligence.',
    url: 'https://strydeos.com/case-studies',
  },
};

export default function Page() {
  return <CaseStudiesPage />;
}
