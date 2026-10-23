import { Minus, Plus } from 'lucide-react';
import type { Settings } from '../types';

type Option<T> = { value: T; label: string };

export function Segmented<T extends string | number | boolean>({
  value,
  options,
  onChange,
  label,
  small = false,
}: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  label?: string;
  small?: boolean;
}) {
  return (
    <div className={`seg${small ? ' seg-small' : ''}`} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className={option.value === value ? 'on' : ''}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ReaderControls({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  const size = settings.fontSize;
  return (
    <div className="reader-panel">
      <div className="panel-heading">阅读显示</div>

      <div className="panel-row">
        <span className="panel-label">主题</span>
        <Segmented
          small
          label="主题"
          value={settings.theme}
          onChange={(theme) => onChange({ theme })}
          options={[
            { value: 'system', label: '自动' },
            { value: 'light', label: '浅色' },
            { value: 'dark', label: '深色' },
          ]}
        />
      </div>

      <div className="panel-row">
        <span className="panel-label">字号</span>
        <div className="stepper">
          <button
            type="button"
            aria-label="减小字号"
            disabled={size <= 14}
            onClick={() => onChange({ fontSize: Math.max(14, size - 1) })}
          >
            <Minus size={14} />
          </button>
          <span className="stepper-value">{size}</span>
          <button
            type="button"
            aria-label="增大字号"
            disabled={size >= 24}
            onClick={() => onChange({ fontSize: Math.min(24, size + 1) })}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="panel-row">
        <span className="panel-label">行距</span>
        <Segmented
          small
          label="行距"
          value={settings.leading}
          onChange={(leading) => onChange({ leading })}
          options={[
            { value: 1.6, label: '紧凑' },
            { value: 1.85, label: '标准' },
            { value: 2.1, label: '宽松' },
          ]}
        />
      </div>

      <div className="panel-row">
        <span className="panel-label">字体</span>
        <Segmented
          small
          label="字体"
          value={settings.serif}
          onChange={(serif) => onChange({ serif })}
          options={[
            { value: false, label: '无衬线' },
            { value: true, label: '衬线' },
          ]}
        />
      </div>

      <div className="panel-row">
        <span className="panel-label">页宽</span>
        <Segmented
          small
          label="页宽"
          value={settings.width}
          onChange={(width) => onChange({ width })}
          options={[
            { value: 'standard', label: '标准' },
            { value: 'wide', label: '宽' },
          ]}
        />
      </div>
    </div>
  );
}
