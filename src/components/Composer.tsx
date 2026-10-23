import { useEffect, useRef, useState } from 'react';
import { ArrowUp, List, Plus, Square } from 'lucide-react';

type ComposerProps = {
  hasBook: boolean;
  streaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onToc: () => void;
  onImport: () => void;
};

export function Composer({ hasBook, streaming, onSend, onStop, onToc, onImport }: ComposerProps) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(200, Math.max(24, el.scrollHeight))}px`;
  }, [value]);

  useEffect(() => {
    if (window.matchMedia('(min-width: 900px)').matches) ref.current?.focus();
  }, []);

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    onSend(text);
    setValue('');
    requestAnimationFrame(() => ref.current?.focus());
  };

  return (
    <div className="composer-wrap">
      <div className="composer">
        <div className="composer-box">
          <textarea
            ref={ref}
            className="composer-input"
            rows={1}
            value={value}
            placeholder={hasBook ? '询问关于这本书的任何问题' : '询问任何问题，或输入书名开始阅读'}
            onChange={(event) => setValue(event.target.value)}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={() => {
              composing.current = false;
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !composing.current && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
          />

          <div className="composer-row">
            <button type="button" className="round-btn" onClick={onImport} aria-label="导入 TXT" title="导入 TXT">
              <Plus size={20} />
            </button>

            <div className="composer-right">
              <button
                type="button"
                className="icon-btn"
                onClick={onToc}
                disabled={!hasBook}
                aria-label="目录"
                title="目录"
              >
                <List size={18} />
              </button>
              {streaming ? (
                <button type="button" className="send-btn" onClick={onStop} aria-label="停止生成" title="停止生成">
                  <Square size={12} fill="currentColor" strokeWidth={0} />
                </button>
              ) : (
                <button
                  type="button"
                  className="send-btn"
                  onClick={submit}
                  disabled={!value.trim()}
                  aria-label="发送"
                  title="发送"
                >
                  <ArrowUp size={18} strokeWidth={2.2} />
                </button>
              )}
            </div>
          </div>
        </div>
        <p className="composer-note">阅读器可能会记错进度。重要内容请自行保存书签。</p>
      </div>
    </div>
  );
}
