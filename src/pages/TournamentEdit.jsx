import { useParams } from 'react-router-dom';
import TournamentForm from '@/components/TournamentForm';

export const route = { path: '/tournaments/:id/edit', layout: 'owner', access: 'authenticated' };

export default function TournamentEdit() {
  const { id } = useParams();
  return <TournamentForm mode="edit" recordId={id} />;
}
