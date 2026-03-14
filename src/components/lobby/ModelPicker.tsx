'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ModelProvider, ModelId } from '@/types/game';
import { PROVIDER_META } from '@/lib/models';

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
                className="font-mono text-[10px] tracking-wider w-16 flex-shrink-0"
                style={{ color: meta.color, opacity: 0.7 }}
              >
                {meta.label}
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
