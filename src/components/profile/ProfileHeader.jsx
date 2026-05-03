import { useState } from 'react';
import { Link } from 'react-router-dom';
import { updateUserProfile } from '../../lib/firestore';

export default function ProfileHeader({ profile, isOwner, isAdmin, onProfileChange }) {
  // Default true: existing users without the field are public.
  const [isPublic, setIsPublic] = useState(profile.isPublic !== false);
  const [saving, setSaving] = useState(false);

  async function togglePrivacy() {
    const next = !isPublic;
    setIsPublic(next);
    setSaving(true);
    try {
      await updateUserProfile(profile.uid, { isPublic: next });
      onProfileChange?.({ ...profile, isPublic: next });
    } catch (err) {
      console.error('Failed to update privacy:', err);
      setIsPublic(!next);
    } finally {
      setSaving(false);
    }
  }

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
        {isOwner && (
          <button
            onClick={togglePrivacy}
            disabled={saving}
            className="mt-1 text-xs text-gray-400 hover:text-white transition-colors disabled:opacity-60"
            title={isPublic ? 'Anyone can see your reviews and lists' : 'Only friends can see your profile'}
          >
            {isPublic ? '🌐 Public profile' : '🔒 Private profile'}
            <span className="text-gray-600 ml-1">— click to toggle</span>
          </button>
        )}
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
