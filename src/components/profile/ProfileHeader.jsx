import { Link } from 'react-router-dom';

export default function ProfileHeader({ profile, isOwner, isAdmin }) {
  return (
    <div className="flex items-center gap-4">
      {profile.photoURL ? (
        <img src={profile.photoURL} alt="" className="w-16 h-16 rounded-full" />
      ) : (
        <div className="w-16 h-16 rounded-full bg-purple-600 flex items-center justify-center text-2xl font-bold">
          {profile.displayName?.[0]}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-bold text-white">{profile.displayName}</h1>
        {isOwner && <p className="text-gray-400 text-sm">{profile.email}</p>}
      </div>
      {isAdmin && (
        <Link
          to="/admin"
          className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 rounded-lg px-3 py-1.5 transition-colors shrink-0"
        >
          Admin
        </Link>
      )}
    </div>
  );
}
