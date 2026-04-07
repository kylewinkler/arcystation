import ArcyFloat from '../../assets/arcy/arcy-float.png';

export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-space-bg">
      <div className="absolute h-72 w-72 rounded-full bg-brand-purple/20 blur-3xl animate-pulse" />

      <div className="relative inline-block animate-float">
        <img
          src={ArcyFloat}
          alt="Loading..."
          className="h-32 w-auto drop-shadow-[0_0_25px_rgba(168,85,247,0.6)]"
        />
      </div>

      <div className="absolute bottom-20 text-sm tracking-widest text-ui-muted animate-pulse">
        LOADING...
      </div>
    </div>
  )
}