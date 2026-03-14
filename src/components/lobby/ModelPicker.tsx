'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ModelProvider, ModelId } from '@/types/game';
import { PROVIDER_META } from '@/lib/models';

// SVG paths sourced from simple-icons (CC0 license), viewBox="0 0 24 24"
const PROVIDER_ICON_PATHS: Record<ModelProvider, string> = {
  anthropic: 'M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z',
  openai: 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z',
  gemini: 'M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81',
  xai: 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z',
};

function ProviderIcon({ provider }: { provider: ModelProvider }) {
  const path = PROVIDER_ICON_PATHS[provider];
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <path d={path} />
    </svg>
  );
}

interface ModelOption {
  provider: ModelProvider;
  modelId: ModelId;
  displayName: string;
  available: boolean;
  gated?: boolean;
}

interface Props {
  value: ModelId;
  onChange: (modelId: ModelId, provider: ModelProvider) => void;
  visible: boolean;
}

export function ModelPicker({ value, onChange, visible }: Props) {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [waitlistModel, setWaitlistModel] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/game/models')
      .then(r => r.json())
      .then(data => {
        setModels(data.models ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (!visible) return null;

  if (loading) {
    return (
      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
        <h3
          className="font-display text-[11px] font-bold tracking-[0.3em] uppercase px-1 mb-2"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          MODEL
        </h3>
        <div className="text-xs font-mono" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
          Loading models...
        </div>
      </div>
    );
  }

  // Group models by provider (order from AVAILABLE_MODELS is preserved by the API)
  const providers = (['anthropic', 'openai', 'gemini', 'xai'] as ModelProvider[]).filter(
    p => models.some(m => m.provider === p)
  );

  return (
    <div className="mt-3 pt-3 relative" style={{ borderTop: '1px solid var(--color-border)' }}>
      <h3
        className="font-display text-[11px] font-bold tracking-[0.3em] uppercase px-1 mb-2"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        MODEL
      </h3>
      <div className="flex flex-col gap-2">
        {providers.map(provider => {
          const providerModels = models.filter(m => m.provider === provider);
          const meta = PROVIDER_META[provider];

          return (
            <div key={provider} className="flex items-center gap-2 flex-wrap">
              <span
                className="w-5 flex-shrink-0 flex items-center justify-center"
                style={{ color: meta.color, opacity: 0.7 }}
                title={meta.label}
              >
                <ProviderIcon provider={provider} />
              </span>
              <div className="flex gap-1.5 flex-wrap">
                {providerModels.map(model => {
                  const isSelected = value === model.modelId;
                  const isDisabled = !model.available;
                  const isGated = model.gated;

                  return (
                    <button
                      key={model.modelId}
                      onClick={() => {
                        if (isGated) {
                          setWaitlistModel(model.displayName);
                        } else if (!isDisabled) {
                          onChange(model.modelId, model.provider);
                        }
                      }}
                      disabled={isDisabled && !isGated}
                      className="px-2.5 py-1 font-mono text-[11px] tracking-wide transition-all duration-200 cursor-pointer disabled:cursor-not-allowed"
                      style={{
                        background: isSelected
                          ? `${meta.color}20`
                          : 'transparent',
                        border: isSelected
                          ? `1.5px solid ${meta.color}`
                          : isGated
                            ? '1.5px dashed #cc44ff55'
                            : '1.5px solid var(--color-border)',
                        color: isDisabled && !isGated
                          ? 'var(--color-text-secondary)'
                          : isGated
                            ? '#cc44ff88'
                            : isSelected
                              ? meta.color
                              : 'var(--color-text-primary)',
                        opacity: isDisabled && !isGated ? 0.3 : isGated ? 0.6 : 1,
                        boxShadow: isSelected ? `0 0 8px ${meta.color}40` : 'none',
                      }}
                      title={
                        isGated
                          ? `${model.displayName} — join waitlist for access`
                          : isDisabled
                            ? `${meta.label} API key not configured`
                            : model.displayName
                      }
                    >
                      {model.displayName}
                      {isGated && (
                        <span className="ml-1 text-[9px]" style={{ color: '#cc44ff88' }}>✦</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Waitlist overlay */}
      {waitlistModel && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            background: 'rgba(10, 10, 20, 0.92)',
            backdropFilter: 'blur(4px)',
            zIndex: 10,
          }}
        >
          <div
            className="w-full mx-2 p-4 flex flex-col gap-3 text-center"
            style={{
              border: '1px solid #cc44ff44',
              background: 'var(--color-bg-panel)',
              boxShadow: '0 0 24px rgba(204, 68, 255, 0.12)',
            }}
          >
            <div>
              <p
                className="font-display text-xs font-bold tracking-[0.3em] uppercase mb-1"
                style={{ color: '#cc44ff', textShadow: '0 0 8px rgba(204,68,255,0.5)' }}
              >
                FRONTIER ACCESS
              </p>
              <p className="font-mono text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                {waitlistModel} and other top-tier models are available on request.
              </p>
            </div>
            <div className="flex gap-2 justify-center">
              <Link
                href="/waitlist"
                className="px-4 py-1.5 font-display text-[11px] font-bold tracking-[0.2em] uppercase transition-all duration-200 hover:scale-105"
                style={{
                  color: '#cc44ff',
                  border: '1.5px solid #cc44ff',
                  background: 'rgba(204, 68, 255, 0.08)',
                }}
              >
                JOIN WAITLIST
              </Link>
              <button
                onClick={() => setWaitlistModel(null)}
                className="px-4 py-1.5 font-mono text-[11px] tracking-wide transition-all duration-200 cursor-pointer"
                style={{
                  color: 'var(--color-text-secondary)',
                  border: '1.5px solid var(--color-border)',
                }}
              >
                BACK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
