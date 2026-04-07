import ArcyAlone from '../../assets/arcy/arcy-alone.png'
import ArcyWindow from '../../assets/arcy/arcy-window.png'

export default function NotFound({
  title,
  subtitle,
  className,
  image,
  children,
}) {
  return (
    <div className={`relative mx-auto w-full max-w-5xl ${className}`}>
      <img
        src={image === 'screen' ? ArcyAlone : ArcyWindow}
        alt="Not found scene"
        
        className="block h-auto w-full select-none"
        draggable="false"
      />

      <div className="absolute left-1/2 top-[28%] w-[58%] -translate-x-1/2 -translate-y-1/2 text-center">
          {title ? (
            <p
              className={`mx-auto ${image === 'screen' ? 'mt-16' : 'mt-0'} max-w-xl text-sm text-purple-100/90 drop-shadow-[0_0_8px_rgba(59,130,246,0.35)] sm:text-base md:text-lg ${title}`}
            >
              {title}
              { subtitle && (
                <><br />{subtitle}</>
              )}
            </p>
          ) : null}

          {children ? <div className="mt-4">{children}</div> : null}
      </div>
    </div>
  )
}