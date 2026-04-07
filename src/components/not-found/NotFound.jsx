import ArcyTheater from '../../assets/images/arcy-scenes/arcy-theater.png'
import ArcyWindow from '../../assets/images/arcy-scenes/arcy-window.png'
import ArcyLost from '../../assets/images/arcy-scenes/arcy-lost.png'
import BrokenProjector from '../../assets/images/arcy-scenes/broken-projector.png'
import EmptyArchives from '../../assets/images/arcy-scenes/empty-archives.png'
import NoComms from '../../assets/images/arcy-scenes/no-comms.png'

const SCENES = {
  theater:    { src: ArcyTheater,     overlay: true  },
  window:     { src: ArcyWindow,      overlay: true  },
  lost:       { src: ArcyLost,        overlay: false },
  projector:  { src: BrokenProjector, overlay: false },
  archives:   { src: EmptyArchives,   overlay: false },
  comms:      { src: NoComms,         overlay: false },
}

const DEFAULT_SCENE = 'window'

export default function NotFound({
  title,
  subtitle,
  className,
  scene,
  image, // legacy compat: 'screen' maps to 'theater'
  children,
}) {
  const sceneKey = scene || (image === 'screen' ? 'theater' : image) || DEFAULT_SCENE
  const resolved = SCENES[sceneKey] || SCENES[DEFAULT_SCENE]

  return (
    <div className={`mx-auto w-full max-w-5xl ${className || ''}`}>
      {resolved.overlay ? (
        // Overlay mode: text floats on top of image (for theater + window scenes)
        <div className="relative">
          <img
            src={resolved.src}
            alt=""
            className="block h-auto w-full select-none"
            draggable="false"
          />
          <div className="absolute left-1/2 top-[28%] w-[58%] -translate-x-1/2 -translate-y-1/2 text-center">
            {title && (
              <p className={`mx-auto ${sceneKey === 'theater' ? 'mt-16' : 'mt-0'} max-w-xl text-sm text-purple-100/90 drop-shadow-[0_0_8px_rgba(59,130,246,0.35)] sm:text-base md:text-lg`}>
                {title}
                {subtitle && (
                  <><br /><span className="text-purple-200/60">{subtitle}</span></>
                )}
              </p>
            )}
            {children && <div className="mt-4">{children}</div>}
          </div>
        </div>
      ) : (
        // Below mode: text sits beneath the image (for detailed scenes)
        <div className="flex flex-col items-center">
          <img
            src={resolved.src}
            alt=""
            className="block h-auto w-full max-w-lg select-none rounded-lg"
            draggable="false"
          />
          {(title || children) && (
            <div className="mt-4 text-center px-4">
              {title && (
                <p className="mx-auto max-w-md text-sm text-purple-100/90 sm:text-base">
                  {title}
                  {subtitle && (
                    <><br /><span className="text-purple-200/60 text-sm">{subtitle}</span></>
                  )}
                </p>
              )}
              {children && <div className="mt-3">{children}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
