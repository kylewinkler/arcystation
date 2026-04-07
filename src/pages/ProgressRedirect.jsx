import { Navigate, useParams } from 'react-router-dom';

export default function ProgressRedirect() {
  const { uid, listId } = useParams();
  return <Navigate to={`/lists/${listId}?viewer=${uid}`} replace />;
}
