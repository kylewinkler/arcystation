export default function ProfileHeader({ profile, isOwner }) {
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
    </div>
  );
}
