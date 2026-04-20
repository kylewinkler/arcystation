import { useState } from 'react';

/**
 * Half-star rating component. Works as both input (interactive) and display (readonly).
 *
 * Props:
 *   value    – current rating (0, 0.5, 1, 1.5, … 5)
 *   onChange – if provided, stars are clickable (input mode)
 *   size     – "sm" | "md" | "lg" (default "md")
 */
export default function StarRating({ value = 0, onChange, size = 'md' }) {
  const interactive = typeof onChange === 'function';
  const [hoverValue, setHoverValue] = useState(0);

  const sizeClass = {
    sm: 'text-xs',
    md: 'text-lg',
    lg: 'text-2xl',
  }[size];

  function handleClick(starIndex, isLeftHalf) {
    const clicked = isLeftHalf ? starIndex - 0.5 : starIndex;
    onChange(clicked === value ? 0 : clicked);
  }

  function handleMouseMove(starIndex, e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const isLeftHalf = (e.clientX - rect.left) < rect.width / 2;
    setHoverValue(isLeftHalf ? starIndex - 0.5 : starIndex);
  }

  function renderStar(starIndex) {
    const displayValue = interactive && hoverValue > 0 ? hoverValue : value;
    const filled = displayValue >= starIndex;
    const halfFilled = !filled && displayValue >= starIndex - 0.5;

    const starVisual = filled ? (
      <span className="text-yellow-400">★</span>
    ) : halfFilled ? (
      <span className="relative inline-block">
        <span className="text-yellow-900">★</span>
        <span className="absolute inset-0 text-yellow-400 overflow-hidden" style={{ width: '50%' }}>★</span>
      </span>
    ) : (
      <span className="text-yellow-900 transition-colors">★</span>
    );

    if (!interactive) {
      return <span key={starIndex} className={sizeClass}>{starVisual}</span>;
    }

    return (
      <span
        key={starIndex}
        className={`relative ${sizeClass} cursor-pointer select-none`}
        onMouseMove={(e) => handleMouseMove(starIndex, e)}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const isLeftHalf = (e.clientX - rect.left) < rect.width / 2;
          handleClick(starIndex, isLeftHalf);
        }}
      >
        {starVisual}
      </span>
    );
  }

  return (
    <div
      className={`inline-flex ${interactive ? 'gap-0.5' : 'gap-px'}`}
      onMouseLeave={() => interactive && setHoverValue(0)}
    >
      {[1, 2, 3, 4, 5].map(renderStar)}
    </div>
  );
}
