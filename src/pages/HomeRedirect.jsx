import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={`/user/${user.uid}`} replace />;
}
