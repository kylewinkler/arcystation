export default function ConstructionModal() {
  const showConstructionModal = false;

  if (!showConstructionModal) return null;

  return (
    <div className="text-white fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div
        className="relative border border-gray-700 rounded-xl p-10 min-h-[70vh] bg-cover bg-center flex flex-col items-center justify-center text-center"
        style={{ backgroundImage: "url(https://cdn.discordapp.com/attachments/640367305225797638/1489610856307228812/kj_construc.png?ex=69dee377&is=69dd91f7&hm=4dfbbfc41b439e5fa149348e0e1f08538e3a5af5d446c8bc475757e7e17851dd&)" }}
      >
        <div className="space-y-4 mt-auto">
          <h3 className="text-2xl font-bold">
            UNDER CONSTRUCTION
          </h3>

          <div className="text-sm">
            Big pappa winky is making some biiiiig updates! Check back later today
          </div>

          <div className="right-10 text-xs text-gray-300">
            P.S. youre probably going to lose your watched movie progress and reviews
          </div>
        </div>


      </div>
    </div>
  );
}