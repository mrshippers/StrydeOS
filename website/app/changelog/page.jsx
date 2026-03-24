import { ChangelogPage } from '../../components/strydeOS-website';

export const metadata = {
  title: 'Changelog',
  description:
    'What we shipped. Updates, new features, and improvements to StrydeOS.',
  openGraph: {
    title: 'Changelog | StrydeOS',
    description: 'What we shipped. Updates, new features, and improvements to StrydeOS.',
    url: 'https://strydeos.com/changelog',
  },
};

export default function Page() {
  return <ChangelogPage />;
}
