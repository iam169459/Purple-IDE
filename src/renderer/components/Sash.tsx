import React, { useCallback, useEffect, useRef, useState } from 'react';

interface SashProps {
  orientation: 'horizontal' | 'vertical';
  position: number;
  min: number;
  max: number;
  onChange: (position: number) => void;
  onDrag?: (position: number) => void;
  className?: string;
  collapsed?: boolean;
  label?: string;
}

/** A 4px split-view handle: X for vertical sashes, Y for horizontal ones. */
export const Sash: React.FC<SashProps> = ({
  orientation,
  position,
  min,
  max,
  onChange,
  onDrag,
  className,
  collapsed,
  label,
}) => {
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ position: 0, client: 0 });
  const isVertical = orientation === 'vertical';

  const clamp = useCallback((value: number) => Math.min(max, Math.max(min, value)), [min, max]);

  const begin = useCallback((e: React.PointerEvent) => {
    if (collapsed) return;
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    startRef.current = { position, client: isVertical ? e.clientX : e.clientY };
  }, [collapsed, isVertical, position]);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const delta = (isVertical ? e.clientX : e.clientY) - startRef.current.client;
      const next = clamp(startRef.current.position + delta);
      onDrag?.(next);
      onChange(next);
    };
    const end = () => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize';
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      document.body.style.cursor = '';
    };
  }, [dragging, isVertical, clamp, onDrag, onChange]);

  const resetPosition = useCallback(() => onChange(clamp((min + max) / 2)), [min, max, onChange, clamp]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const decrement = isVertical ? 'ArrowLeft' : 'ArrowUp';
    const increment = isVertical ? 'ArrowRight' : 'ArrowDown';
    if (e.key === decrement) {
      e.preventDefault();
      onChange(clamp(position - 16));
    } else if (e.key === increment) {
      e.preventDefault();
      onChange(clamp(position + 16));
    }
  };

  return (
    <div
      className={`sash sash-${orientation} ${dragging ? 'dragging' : ''} ${className || ''}`}
      role="separator"
      aria-orientation={orientation}
      aria-label={label || (isVertical ? 'Resize sidebar' : 'Resize panel')}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={position}
      tabIndex={collapsed ? -1 : 0}
      onPointerDown={begin}
      onDoubleClick={resetPosition}
      onKeyDown={handleKeyDown}
      style={{
        width: isVertical ? 4 : '100%',
        height: isVertical ? '100%' : 4,
        flexShrink: 0,
        cursor: collapsed ? 'default' : (isVertical ? 'col-resize' : 'row-resize'),
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      <div className="sash-grip" />
    </div>
  );
};
