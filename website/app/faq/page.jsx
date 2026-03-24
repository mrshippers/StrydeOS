import { FAQPage } from '../../components/strydeOS-website';

export const metadata = {
  title: 'FAQ',
  description:
    'Frequently asked questions about StrydeOS — pricing, integrations, setup, and how it works for private practice clinics.',
  openGraph: {
    title: 'FAQ | StrydeOS',
    description:
      'Frequently asked questions about StrydeOS — pricing, integrations, setup, and how it works for private practice clinics.',
    url: 'https://strydeos.com/faq',
  },
};

export default function Page() {
  return <FAQPage />;
}
