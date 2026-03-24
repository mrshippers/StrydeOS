import ContactPage from '../../components/contact';

export const metadata = {
  title: 'Contact',
  description:
    'Get in touch with StrydeOS. Book a free 30-minute Clinical Performance Audit for your practice.',
  openGraph: {
    title: 'Contact | StrydeOS',
    description:
      'Get in touch with StrydeOS. Book a free 30-minute Clinical Performance Audit for your practice.',
    url: 'https://strydeos.com/contact',
  },
};

export default function Page() {
  return <ContactPage />;
}
