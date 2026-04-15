import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function ProfileHeader({ profile, isOwner }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-4">
      {profile.photoURL ? (
        <img src={profile.photoURL} alt="" className="w-16 h-16 rounded-full" />
      ) : (
        <div className="w-16 h-16 rounded-full bg-purple-600 flex items-center justify-center text-2xl font-bold">
          {profile.displayName?.[0]}
        </div>
      )}
      <div>
        <h1 className="text-2xl font-bold text-white">{profile.displayName}</h1>
        {isOwner && <p className="text-gray-400 text-sm">{profile.email}</p>}
      </div>
      {isOwner && (
        <button
          onClick={async () => { await logout(); navigate('/login'); }}
          className="ml-auto text-sm text-gray-500 hover:text-red-400 border border-gray-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          Sign out
        </button>
      )}
    </div>
  );
}
