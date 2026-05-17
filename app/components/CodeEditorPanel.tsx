'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../AppContext';
import { X, Play, Loader2, Download } from 'lucide-react';
import { OutputMessage } from '../types';

let fengariLoaded = false;
let fengariLoading: Promise<void> | null = null;

function loadFengari(): Promise<void> {
  if (fengariLoaded) return Promise.resolve();
  if (fengariLoading) return fengariLoading;
  fengariLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/fengari-web@0.1.4/dist/fengari-web.js';
    s.onload = () => { fengariLoaded = true; resolve(); };
    s.onerror = () => reject(new Error('Failed to load Lua runtime from CDN.'));
    document.head.appendChild(s);
  });
  return fengariLoading;
}

let cmLoaded = false;
let cmLoading: Promise<void> | null = null;

function loadCodeMirror(): Promise<void> {
  if (cmLoaded) return Promise.resolve();
  if (cmLoading) return cmLoading;
  cmLoading = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css';
    document.head.appendChild(css);

    const theme = document.createElement('link');
    theme.rel = 'stylesheet';
    theme.href = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/monokai.min.css';
    document.head.appendChild(theme);

    const style = document.createElement('style');
    style.textContent = `
      .CodeMirror { height: 100% !important; font-size: 12px; font-family: 'Consolas','Monaco',monospace; background:#1b1b1b !important; }
      .CodeMirror-scroll { height: 100% !important; }
      .cm-s-monokai.CodeMirror { background: #1b1b1b !important; color: #d4d4d4; }
      .cm-s-monokai .CodeMirror-gutters { background: #222222 !important; border-right: 1px solid #333; }
      .cm-s-monokai .CodeMirror-linenumber { color: #555; }
      .cm-s-monokai .CodeMirror-cursor { border-left: 2px solid #00a2ff; }
      .cm-s-monokai .CodeMirror-selected { background: #264f78 !important; }
    `;
    document.head.appendChild(style);

    const core = document.createElement('script');
    core.src = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js';
    core.onload = () => {
      const lua = document.createElement('script');
      lua.src = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/lua/lua.min.js';
      lua.onload = () => { cmLoaded = true; resolve(); };
      lua.onerror = reject;
      document.head.appendChild(lua);
    };
    core.onerror = reject;
    document.head.appendChild(core);
  });
  return cmLoading;
}

type RunStage = 'idle' | 'downloading' | 'running';

export function CodeEditorPanel() {
  const ctx = useAppContext();
  const [runStage, setRunStage] = useState<RunStage>('idle');
  const editorRef = useRef<HTMLDivElement>(null);
  const cmRef = useRef<any>(null);
  const objectsRef = useRef(ctx.objects);
  const activeIdRef = useRef(ctx.activeScriptId);

  useEffect(() => { objectsRef.current = ctx.objects; }, [ctx.objects]);
  useEffect(() => { activeIdRef.current = ctx.activeScriptId; }, [ctx.activeScriptId]);

  useEffect(() => {
    if (!ctx.activeScriptId || !editorRef.current) return;
    let cancelled = false;

    loadCodeMirror().then(() => {
      if (cancelled || !editorRef.current) return;
      const CM = (window as any).CodeMirror;
      if (!CM) return;

      if (cmRef.current) {
        try { cmRef.current.toTextArea(); } catch (_) {}
        cmRef.current = null;
      }
      editorRef.current.innerHTML = '';

      const activeScript = objectsRef.current.find(o => o.id === ctx.activeScriptId);
      const ta = document.createElement('textarea');
      editorRef.current.appendChild(ta);

      const cm = CM.fromTextArea(ta, {
        mode: 'lua',
        theme: 'monokai',
        lineNumbers: true,
        tabSize: 2,
        indentWithTabs: false,
        autofocus: true,
        extraKeys: { Tab: (cm: any) => cm.replaceSelection('  ') },
      });

      cm.setValue(activeScript?.code || '');
      cm.setSize('100%', '100%');

      cm.on('change', (instance: any) => {
        const newCode = instance.getValue();
        const id = activeIdRef.current;
        ctx.setObjects(objectsRef.current.map(o => o.id === id ? { ...o, code: newCode } : o));
      });

      cmRef.current = cm;
    });

    return () => { cancelled = true; };
  }, [ctx.activeScriptId]);

  const executeCode = async () => {
    const activeScript = objectsRef.current.find(o => o.id === activeIdRef.current);
    if (!activeScript || runStage !== 'idle') return;

    const code = activeScript.code || '';
    const scriptName = activeScript.name;
    const captured: OutputMessage[] = [];

    try {
      if (!fengariLoaded) {
        setRunStage('downloading');
        ctx.setOutputMessages(prev => [...prev, {
          id: Date.now().toString(), type: 'info',
          content: '↓ Downloading Lua runtime… (first time only, will be cached)',
          source: 'System', timestamp: Date.now(),
        }]);
      }

      await loadFengari();
      setRunStage('running');
      ctx.setOutputMessages(prev => [...prev, {
        id: Date.now().toString(), type: 'info',
        content: `▶ Running "${scriptName}"`,
        source: scriptName, timestamp: Date.now(),
      }]);

      const fengariObj = (window as any).fengari;
      const { lua, lualib, lauxlib, to_luastring } = fengariObj;
      const L = lauxlib.luaL_newstate();
      lualib.luaL_openlibs(L);

      const luaValToStr = (state: any, idx: number): string => {
        lauxlib.luaL_tolstring(state, idx, null);
        const s = lua.lua_tojsstring(state, -1) ?? 'nil';
        lua.lua_pop(state, 1);
        return s;
      };

      lua.lua_pushcfunction(L, (state: any) => {
        const n = lua.lua_gettop(state);
        const parts: string[] = [];
        for (let i = 1; i <= n; i++) parts.push(luaValToStr(state, i));
        captured.push({ id: Date.now().toString() + Math.random(), type: 'print', content: parts.join('\t'), source: scriptName, timestamp: Date.now() });
        return 0;
      });
      lua.lua_setglobal(L, to_luastring('print'));

      lua.lua_pushcfunction(L, (state: any) => {
        const n = lua.lua_gettop(state);
        const parts: string[] = [];
        for (let i = 1; i <= n; i++) parts.push(luaValToStr(state, i));
        captured.push({ id: Date.now().toString() + Math.random(), type: 'warn', content: parts.join('\t'), source: scriptName, timestamp: Date.now() });
        return 0;
      });
      lua.lua_setglobal(L, to_luastring('warn'));

      for (const g of ['os', 'io', 'dofile', 'loadfile']) {
        lua.lua_pushnil(L);
        lua.lua_setglobal(L, to_luastring(g));
      }

      const loadStatus = lauxlib.luaL_loadstring(L, to_luastring(code));
      if (loadStatus !== lua.LUA_OK) {
        throw new Error(lua.lua_tojsstring(L, -1) ?? 'Syntax error');
      }
      const runStatus = lua.lua_pcall(L, 0, lua.LUA_MULTRET, 0);
      if (runStatus !== lua.LUA_OK) {
        throw new Error(lua.lua_tojsstring(L, -1) ?? 'Runtime error');
      }
      lua.lua_close(L);

      if (captured.length === 0) {
        captured.push({ id: Date.now().toString(), type: 'info', content: `"${scriptName}" finished with no output.`, source: scriptName, timestamp: Date.now() });
      }

    } catch (err: any) {
      captured.push({ id: Date.now().toString(), type: 'error', content: String(err?.message ?? err), source: scriptName, timestamp: Date.now() });
    }

    ctx.setOutputMessages(prev => [...prev, ...captured]);
    setRunStage('idle');
  };

  if (ctx.openScriptIds.length === 0) {
    return (
      <div className="flex-1 bg-[#1b1b1b] flex flex-col h-full items-center justify-center text-[#aaaaaa]">
        <p>No scripts open</p>
        <p className="text-xs mt-2">Double-click a script in the Explorer to open</p>
      </div>
    );
  }

  const openScripts = ctx.openScriptIds
    .map(id => ctx.objects.find(o => o.id === id))
    .filter(Boolean) as typeof ctx.objects;

  const closeTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newOpen = ctx.openScriptIds.filter(sid => sid !== id);
    ctx.setOpenScriptIds(newOpen);
    if (ctx.activeScriptId === id)
      ctx.setActiveScriptId(newOpen.length > 0 ? newOpen[newOpen.length - 1] : null);
  };

  const buttonContent = {
    idle:        <><Play size={10} /> Play</>,
    downloading: <><Download size={10} className="animate-bounce" /> Downloading Lua…</>,
    running:     <><Loader2 size={10} className="animate-spin" /> Running…</>,
  }[runStage];

  const buttonColor = runStage === 'downloading'
    ? 'bg-[#2a2a1a] border-[#5a5a2a] text-[#facc15]'
    : 'bg-[#1a3a1a] border-[#2a5a2a] text-[#4ade80]';

  return (
    <div className="flex-1 bg-[#1b1b1b] flex flex-col h-full overflow-hidden">
      <div className="h-8 bg-[#222222] border-b border-[#333333] flex overflow-x-auto no-scrollbar">
        {openScripts.map(script => (
          <div
            key={script.id}
            onClick={() => ctx.setActiveScriptId(script.id)}
            className={`px-4 flex items-center gap-2 border-r border-[#333333] text-xs cursor-pointer group flex-shrink-0
              ${ctx.activeScriptId === script.id
                ? 'bg-[#1b1b1b] border-t-2 border-t-[#00a2ff]'
                : 'bg-[#2d2d2d] opacity-60 border-t-2 border-t-transparent hover:opacity-100'}`}
          >
            <span className="text-[#00ff88] text-[10px]">{'{'} {'}'}</span>
            <span className="truncate max-w-40">{script.name}</span>
            <X size={12} className="opacity-40 group-hover:opacity-100 transition-opacity" onClick={(e) => closeTab(e, script.id)} />
          </div>
        ))}
        {openScripts.length > 0 && ctx.activeScriptId && (
          <div className="flex-1 flex justify-end items-center px-4 bg-[#222222]">
            <button
              onClick={executeCode}
              disabled={runStage !== 'idle'}
              className={`flex items-center gap-1.5 text-[10px] border hover:opacity-80 disabled:opacity-60 px-3 py-1 rounded font-medium transition-all ${buttonColor}`}
            >
              {buttonContent}
            </button>
          </div>
        )}
      </div>
      <div ref={editorRef} className="flex-1 overflow-hidden" />
    </div>
  );
}
