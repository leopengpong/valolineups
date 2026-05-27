export function ZoomCrosshair({ x, y }: { x: number; y: number }) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-50%, -50%)",
      }}
    >
      <svg width="52" height="52" viewBox="0 0 52 52">
        <defs>
          <filter id="xh-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="1.2" floodColor="black" floodOpacity="0.85" />
          </filter>
        </defs>
        <g filter="url(#xh-shadow)">
          <rect x="2" y="25" width="14" height="2" fill="white" />
          <rect x="36" y="25" width="14" height="2" fill="white" />
          <rect x="25" y="2" width="2" height="14" fill="white" />
          <rect x="25" y="36" width="2" height="14" fill="white" />
        </g>
      </svg>
    </div>
  );
}
