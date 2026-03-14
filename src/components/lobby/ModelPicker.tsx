'use client';

import { useEffect, useState } from 'react';
import type { ModelProvider, ModelId } from '@/types/game';
import { PROVIDER_META } from '@/lib/models';

interface ModelOption {
  provider: ModelProvider;
  modelId: ModelId;
  displayName: string;
  available: boolean;
}

interface Props {
  value: ModelId;
  onChange: (modelId: ModelId, provider: ModelProvider) => void;
  visible: boolean;
}

export function ModelPicker({ value, onChange, visible }: Props) {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Group models by provider
  const providers = (['anthropic', 'openai', 'gemini', 'xai'] as ModelProvider[]).filter(
    p => models.some(m => m.provider === p)
  );

  return (
    <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
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

                  return (
                    <button
                      key={model.modelId}
                      onClick={() => !isDisabled && onChange(model.modelId, model.provider)}
                      disabled={isDisabled}
                      className="px-2.5 py-1 font-mono text-[11px] tracking-wide transition-all duration-200 cursor-pointer disabled:cursor-not-allowed"
                      style={{
                        background: isSelected
                          ? `${meta.color}20`
                          : 'transparent',
                        border: isSelected
                          ? `1.5px solid ${meta.color}`
                          : '1.5px solid var(--color-border)',
                        color: isDisabled
                          ? 'var(--color-text-secondary)'
                          : isSelected
                            ? meta.color
                            : 'var(--color-text-primary)',
                        opacity: isDisabled ? 0.3 : 1,
                        boxShadow: isSelected ? `0 0 8px ${meta.color}40` : 'none',
                      }}
                      title={isDisabled ? `${meta.label} API key not configured` : model.displayName}
                    >
                      {model.displayName}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
