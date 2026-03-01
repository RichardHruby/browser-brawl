'use client';

interface Props {
  liveViewUrl: string;
  hitAt: number;
}

export function BrowserFrame({ liveViewUrl, hitAt }: Props) {
  return (
    <div className="relative flex-1 min-w-0 flex flex-col rounded overflow-hidden"
      style={{ border: '1px solid var(--color-border)', background: '#111' }}>

      {/* Browser chrome bar */}
      <div className="flex items-center gap-2 px-3 py-2 shrink-0"
        style={{ background: 'var(--color-bg-panel)', borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ background: '#ff5f57' }} />
          <div className="w-3 h-3 rounded-full" style={{ background: '#febc2e' }} />
          <div className="w-3 h-3 rounded-full" style={{ background: '#28c840' }} />
        </div>
        <div className="flex-1 rounded px-3 py-0.5"
          style={{ background: 'var(--color-bg-card)' }} />
        <div className="text-xs font-mono" style={{ color: 'var(--color-attacker)', opacity: 0.7 }}>
          ● LIVE
        </div>
      </div>

      {/* Iframe */}
      <div className="relative flex-1">
        <iframe
          src={liveViewUrl || 'about:blank'}
          className="w-full h-full border-0"
          sandbox="allow-same-origin allow-scripts"
          allow="clipboard-read; clipboard-write"
          title="Live Browser Session"
        />

        {/* CRT scanline overlay */}
        <div className="crt-overlay" />

        {/* Hit flash */}
        {hitAt > 0 && (
          <div
            key={hitAt}
            className="absolute inset-0 z-20 pointer-events-none hit-flash"
            style={{ background: 'var(--color-hit-flash)' }}
          />
        )}

        {/* No URL fallback */}
        {!liveViewUrl && (
          <div className="absolute inset-0 flex items-center justify-center z-10"
            style={{ background: 'var(--color-bg-deep)' }}>
            <div className="text-center font-mono text-sm"
              style={{ color: 'var(--color-text-secondary)' }}>
              <div className="text-2xl mb-2">⏳</div>
              <div>Waiting for browser session...</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
