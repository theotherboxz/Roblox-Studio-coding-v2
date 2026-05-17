'use client';

import React, { useEffect, useRef } from 'react';
import { useAppContext } from '../AppContext';
import { Trash2, Terminal } from 'lucide-react';

export function OutputPanel() {
  const { outputMessages, setOutputMessages } = useAppContext();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [outputMessages]);

  const colorMap: Record<string, string> = {
    print: '#d4d4d4',
    warn:  '#f59e0b',
    error: '#ef4444',
    info:  '#6b7280',
  };

  const prefixMap: Record<string, string> = {
    print: '',
    warn:  '⚠ ',
    error: '✖ ',
    info:  '  ',
  };

  return (
    <div className="h-44 flex-shrink-0 bg-[#1a1a1a] border-t border-[#333333] flex flex-col">
      {/* Header */}
      <div className="h-7 bg-[#222222] border-b border-[#333333] flex items-center justify-between px-3 flex-shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#888888] flex items-center gap-1.5">
          <Terminal size={11} className="text-[#00a2ff]" /> Output
        </span>
        <button
          onClick={() => setOutputMessages([])}
          className="text-[#555555] hover:text-[#aaaaaa] transition-colors"
          title="Clear output"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-5 custom-scroll">
        {outputMessages.length === 0 ? (
          <p className="text-[#444444] italic">No output yet. Press Play to run a script.</p>
        ) : (
          outputMessages.map(msg => (
            <div key={msg.id} className="flex gap-2 items-start">
              {msg.source && (
                <span className="text-[#555555] flex-shrink-0 select-none">
                  [{msg.source}]
                </span>
              )}
              <span style={{ color: colorMap[msg.type] ?? '#d4d4d4' }} className="whitespace-pre-wrap break-all">
                {prefixMap[msg.type]}{msg.content}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
