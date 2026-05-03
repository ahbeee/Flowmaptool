import React from 'react';
import { SIDE_PANEL_MAX_WIDTH, SIDE_PANEL_MIN_WIDTH } from './ui-config';

type PanelResizerProps = {
  active: boolean;
  label: string;
  value: number;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
};

export function PanelResizer({
  active,
  label,
  value,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyDown
}: PanelResizerProps) {
  return (
    <div
      className={active ? 'panel-resizer panel-resizer-active' : 'panel-resizer'}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={SIDE_PANEL_MIN_WIDTH}
      aria-valuemax={SIDE_PANEL_MAX_WIDTH}
      aria-valuenow={value}
      tabIndex={0}
      data-testid="side-panel-resizer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    />
  );
}
