import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import MonacoEditor, { OnMount, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { registerMonacoThemes, type ThemeId } from '../monacoTheme';
import { Codi } from './codicons';

loader.config({ monaco });
registerMonacoThemes(monaco);

export interface EditorMetrics {
  line: number;
  column: number;
  selectionLength: number;
  language: string;
  languageId: string;
  eol: 'LF' | 'CRLF';
  tabSize: number;
  insertSpaces: boolean;
}

export interface EditorProblem {
  file: string;
  line: number;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
}

export interface EditorHandle {
  focus: () => void;
  revealLine: (line: number, column?: number) => void;
  runAction: (actionId: string) => void;
}

interface Props {
  filePath: string;
  content: string;
  rootFolder?: string | null;
  onUpdate: (content: string) => void;
  fontSize: number;
  theme: ThemeId;
  wordWrap?: boolean;
  minimap?: boolean;
  revealLine?: number;
  revealNonce?: number;
  onStateChange?: (state: EditorMetrics) => void;
  onDiagnostics?: (file: string, problems: EditorProblem[]) => void;
}

const EXT_TO_LANGUAGE: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  py: 'python', java: 'java', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', h: 'cpp', hpp: 'cpp',
  c: 'c', cs: 'csharp', rb: 'ruby', go: 'go', rs: 'rust', php: 'php',
  html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
  json: 'json', jsonc: 'json', xml: 'xml', md: 'markdown', mdx: 'markdown',
  yml: 'yaml', yaml: 'yaml', sh: 'shell', bash: 'shell', zsh: 'shell',
  swift: 'swift', kt: 'kotlin', scala: 'scala', sql: 'sql', r: 'r',
  dart: 'dart', lua: 'lua', pl: 'perl', hs: 'haskell', clj: 'clojure', elm: 'elm',
  vue: 'html', svelte: 'html', toml: 'ini', ini: 'ini', env: 'ini',
};

const LANGUAGE_LABEL: Record<string, string> = {
  plaintext: 'Plain Text',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  markdown: 'Markdown',
  json: 'JSON',
  css: 'CSS',
  scss: 'SCSS',
  less: 'Less',
  html: 'HTML',
  xml: 'XML',
  yaml: 'YAML',
  shell: 'Shell Script',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  java: 'Java',
  ruby: 'Ruby',
  go: 'Go',
  rust: 'Rust',
  php: 'PHP',
  swift: 'Swift',
  kotlin: 'Kotlin',
  scala: 'Scala',
  sql: 'SQL',
  r: 'R',
  dart: 'Dart',
  lua: 'Lua',
  perl: 'Perl',
  haskell: 'Haskell',
  clojure: 'Clojure',
  elm: 'Elm',
  ini: 'INI',
};

export const languageIdForPath = (filePath: string): string => {
  if (filePath.startsWith('untitled:')) return 'plaintext';
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return EXT_TO_LANGUAGE[ext] || 'plaintext';
};

export const languageLabelFor = (languageId: string): string =>
  LANGUAGE_LABEL[languageId] || languageId.replace(/^\w/, (c) => c.toUpperCase());

const severityName = (severity: number): EditorProblem['severity'] => {
  if (severity === monaco.MarkerSeverity.Error) return 'error';
  if (severity === monaco.MarkerSeverity.Warning) return 'warning';
  if (severity === monaco.MarkerSeverity.Info) return 'info';
  return 'hint';
};

const Editor = forwardRef<EditorHandle, Props>(({
  filePath,
  content,
  rootFolder,
  onUpdate,
  fontSize,
  theme,
  wordWrap = false,
  minimap = true,
  revealLine,
  revealNonce,
  onStateChange,
  onDiagnostics,
}, ref) => {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monaco | null>(null);
  const filePathRef = useRef(filePath);
  const onStateChangeRef = useRef(onStateChange);
  const onDiagnosticsRef = useRef(onDiagnostics);
  const markerDisposableRef = useRef<monaco.IDisposable | null>(null);
  const latestContentRef = useRef(content);
  latestContentRef.current = content;

  useEffect(() => {
    filePathRef.current = filePath;
  }, [filePath]);
  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);
  useEffect(() => {
    onDiagnosticsRef.current = onDiagnostics;
  }, [onDiagnostics]);

  const reportState = useCallback(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return;
    const position = editor.getPosition();
    const selection = editor.getSelection();
    const selectionLength = selection && !selection.isEmpty() ? model.getValueInRange(selection).length : 0;
    const options = model.getOptions();
    const languageId = model.getLanguageId();
    onStateChangeRef.current?.({
      line: position?.lineNumber ?? 1,
      column: position?.column ?? 1,
      selectionLength,
      language: languageLabelFor(languageId),
      languageId,
      eol: model.getEOL() === '\r\n' ? 'CRLF' : 'LF',
      tabSize: options.tabSize,
      insertSpaces: options.insertSpaces,
    });
  }, []);

  const reportDiagnostics = useCallback(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    const monacoApi = monacoRef.current;
    if (!model || !monacoApi) return;
    const markers = monacoApi.editor.getModelMarkers({ resource: model.uri });
    onDiagnosticsRef.current?.(
      filePathRef.current,
      markers.map((marker) => ({
        file: filePathRef.current,
        line: marker.startLineNumber,
        message: marker.message,
        severity: severityName(marker.severity),
      })),
    );
  }, []);

  const handleMount: OnMount = (editor, monacoApi) => {
    editorRef.current = editor;
    monacoRef.current = monacoApi;
    monacoApi.editor.setTheme(theme);

    editor.onDidChangeCursorSelection(() => reportState());
    editor.onDidChangeModel(() => {
      const model = editor.getModel();
      if (model) {
        monacoApi.editor.setModelLanguage(model, languageIdForPath(filePathRef.current));
      }
      reportState();
      reportDiagnostics();
    });
    markerDisposableRef.current?.dispose();
    markerDisposableRef.current = monacoApi.editor.onDidChangeMarkers(() => reportDiagnostics());

    reportState();
    reportDiagnostics();
    editor.focus();
  };

  useEffect(() => () => {
    markerDisposableRef.current?.dispose();
    markerDisposableRef.current = null;
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return;
    const languageId = languageIdForPath(filePath);
    if (model.getLanguageId() !== languageId) monacoRef.current?.editor.setModelLanguage(model, languageId);
    const frame = requestAnimationFrame(() => {
      reportState();
      reportDiagnostics();
    });
    return () => cancelAnimationFrame(frame);
  }, [filePath, reportState, reportDiagnostics]);

  useEffect(() => {
    if (revealLine == null) return;
    const editor = editorRef.current;
    if (!editor) return;
    const line = Math.max(1, Math.floor(revealLine));
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
    editor.focus();
  }, [filePath, revealLine, revealNonce]);

  useEffect(() => {
    monacoRef.current?.editor.setTheme(theme);
  }, [theme]);

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    revealLine: (line: number, column = 1) => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column });
      editor.focus();
    },
    runAction: (actionId: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      void editor.getAction(actionId)?.run();
    },
  }), []);

  const breadcrumbs = React.useMemo(() => {
    const isUntitled = filePath.startsWith('untitled:');
    const normalized = filePath.replace(/\\/g, '/');
    const root = (rootFolder || '').replace(/\\/g, '/').replace(/\/+$/, '');
    let relative = normalized;
    let prefixLabel: string | null = null;
    if (!isUntitled && root && normalized.startsWith(`${root}/`)) {
      relative = normalized.slice(root.length + 1);
      prefixLabel = root.split('/').filter(Boolean).pop() || null;
    } else if (!isUntitled) {
      prefixLabel = normalized.startsWith('/') ? 'workspace' : null;
      relative = normalized.startsWith('/') ? normalized.replace(/^\/+/, '') : normalized;
    }
    const parts = isUntitled ? ['Untitled'] : relative.split('/').filter(Boolean);
    const crumbs = parts.map((part, index) => ({
      label: part,
      isFile: index === parts.length - 1,
    }));
    return { prefixLabel, crumbs };
  }, [filePath, rootFolder]);

  const language = languageIdForPath(filePath);

  return (
    <div className="wb-editor">
      {!filePath.startsWith('__') && (
        <div className="wb-breadcrumbs" aria-label="Breadcrumbs">
          <Codi name="file-code" size={13} className="wb-breadcrumb-icon" />
          {breadcrumbs.prefixLabel && (
            <>
              <span className="wb-crumb">{breadcrumbs.prefixLabel}</span>
              <Codi name="chevron-right" size={12} className="wb-crumb-sep" />
            </>
          )}
          {breadcrumbs.crumbs.map((crumb, index) => (
            <React.Fragment key={`${crumb.label}-${index}`}>
              {index > 0 && <Codi name="chevron-right" size={12} className="wb-crumb-sep" />}
              <span className={`wb-crumb ${crumb.isFile ? 'is-file' : ''}`} title={crumb.label}>
                {crumb.isFile && <Codi name="symbol-file" size={12} className="wb-crumb-file-icon" />}
                {crumb.label}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}
      <div className="wb-editor-monaco">
        <MonacoEditor
          height="100%"
          path={filePath}
          language={language}
          value={content}
          onChange={(value) => {
            if (value === undefined || value === latestContentRef.current) return;
            onUpdate(value);
          }}
          onMount={handleMount}
          theme={theme}
          options={{
            fontSize,
            fontFamily: "'JetBrains Mono', 'SF Mono', 'Cascadia Code', 'Fira Code', Menlo, Consolas, monospace",
            fontLigatures: true,
            lineNumbers: 'on',
            minimap: { enabled: minimap, renderCharacters: false, maxColumn: 80 },
            scrollBeyondLastLine: false,
            wordWrap: wordWrap ? 'on' : 'off',
            tabSize: 2,
            insertSpaces: true,
            detectIndentation: false,
            automaticLayout: true,
            padding: { top: 10, bottom: 10 },
            renderLineHighlight: 'all',
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            smoothScrolling: true,
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: 'active', indentation: true },
            autoIndent: 'full',
            formatOnPaste: true,
            suggestOnTriggerCharacters: true,
            quickSuggestions: true,
            folding: true,
            foldingHighlight: true,
            lineNumbersMinChars: 3,
            glyphMargin: false,
            lineDecorationsWidth: 10,
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            renderWhitespace: 'selection',
            fixedOverflowWidgets: true,
            stickyScroll: { enabled: true, maxLineCount: 3 },
            scrollbar: {
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10,
              verticalSliderSize: 10,
              horizontalSliderSize: 10,
              useShadows: false,
            },
          }}
        />
      </div>
    </div>
  );
});

Editor.displayName = 'Editor';

export default React.memo(Editor);
