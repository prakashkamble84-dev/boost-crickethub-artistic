import TournamentForm from '@/components/TournamentForm';

export const route = { path: '/tournaments/new', layout: 'owner', access: 'authenticated' };

export default function TournamentNew() {
  return <TournamentForm mode="create" />;
}
