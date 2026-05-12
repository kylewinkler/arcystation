import { useState } from 'react';

export default function HypeRating({ value = 0, onChange, size = 'md' }) {
  const interactive = typeof onChange === 'function';
  const [hoverValue, setHoverValue] = useState(0);

  const sizeClass = {
    sm: 'text-xs',
    md: 'text-lg',
    lg: 'text-2xl',
  }[size];

  function handleClick(flameIndex) {
    onChange(flameIndex === value ? 0 : flameIndex);
  }

  function renderFlame(flameIndex) {
    const displayValue = interactive && hoverValue > 0 ? hoverValue : value;
    const filled = displayValue >= flameIndex;
    const flameVisual = (
      <span className={filled ? '' : 'grayscale opacity-30'}>🔥</span>
    );

    if (!interactive) {
      return <span key={flameIndex} className={sizeClass}>{flameVisual}</span>;
    }

    return (
      <span
        key={flameIndex}
        className={`${sizeClass} cursor-pointer select-none leading-none`}
        onMouseEnter={() => setHoverValue(flameIndex)}
        onClick={() => handleClick(flameIndex)}
      >
        {flameVisual}
      </span>
    );
  }

  return (
    <div
      className={`inline-flex ${interactive ? 'gap-0.5' : 'gap-px'}`}
      onMouseLeave={() => interactive && setHoverValue(0)}
    >
      {[1, 2, 3, 4, 5].map(renderFlame)}
    </div>
  );
}
