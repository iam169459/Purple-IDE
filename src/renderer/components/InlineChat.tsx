import React, { useState, useRef, useEffect } from 'react';
import { IconSend, IconX } from './icons';

/** Lightweight markdown renderer for inline chat */
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  const renderInline = (line: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let pk = 0;
    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) parts.push(<span key={pk++}>{line.slice(lastIndex, match.index)}</span>);
      const m = match[0];
      if (m.startsWith('`')) parts.push(<code key={pk++} className="md-inline-code">{m.slice(1, -1)}</code>);
      else if (m.startsWith('**')) parts.push(<strong key={pk++}>{m.slice(2, -2)}</strong>);
      else if (m.startsWith('*')) parts.push(<em key={pk++}>{m.slice(1, -1)}</em>);
      else if (m.startsWith('[')) {
        const lm = m.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (lm) parts.push(<a key={pk++} href={lm[2]} className="md-link" target="_blank" rel="noopener">{lm[1]}</a>);
      }
      lastIndex = match.index + m.length;
    }
    if (lastIndex < line.length) parts.push(<span key={pk++}>{line.slice(lastIndex)}</span>);
    return parts.length ? parts : [<span key={0}>{line}</span>];
  };

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
      i++;
      elements.push(
        <div key={key++} className="md-code-block">
          {lang && <div className="md-code-lang">{lang}</div>}
          <pre><code>{codeLines.join('\n')}</code></pre>
        </div>
      );
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(<li key={key++}>{renderInline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>);
        i++;
      }
      elements.push(<ul key={key++} className="md-ul">{items}</ul>);
      continue;
    }
    if (line.trim() === '') { i++; continue; }
    elements.push(<p key={key++} className="md-p">{renderInline(line)}</p>);
    i++;
  }
  return elements;
}

interface InlineChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  filePath: string;
  fileContent: string;
  apiKey: string;
  model: string;
  endpointType: string;
  customEndpoint: string;
  localEndpoint: string;
  freeProvider: string;
  onClose: () => void;
  onError: (msg: string) => void;
}

function parseToolCard(text: string): string | null {
  if (text.startsWith('__tool_card__write_file__')) {
    return text.slice('__tool_card__write_file__'.length);
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && parsed.tool === 'write_file' && parsed.arguments?.path) {
      return parsed.arguments.path as string;
    }
  } catch {}
  return null;
}

const InlineChat: React.FC<Props> = ({ filePath, fileContent, apiKey, model, endpointType, customEndpoint, localEndpoint, freeProvider, onClose, onError }) => {
  const [messages, setMessages] = useState<InlineChatMessage[]>([
    { role: 'assistant', content: `Ask me about **${filePath.split('/').pop()}**. I can explain, refactor, or debug this file.` },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMsg: InlineChatMessage = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const ctxMsg = {
      role: 'system' as const,
      content: `The user is asking about this file:\nFile: ${filePath}\n\n\`\`\`\n${fileContent}\n\`\`\`\n\nAnswer questions about this specific file. Be concise and practical. Reference specific line numbers when relevant.`,
    };

    try {
      let ep = 'https://api.openai.com';
      if (endpointType === 'ollama') {
        ep = 'http://localhost:11434';
      } else if (endpointType === 'local_other') {
        ep = localEndpoint || 'http://localhost:1234';
      } else if (endpointType === 'custom') {
        ep = customEndpoint;
      } else if (endpointType === 'free') {
        const endpoints: Record<string, string> = {
          groq: 'https://api.groq.com/openai',
          deepseek: 'https://api.deepseek.com',
          gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
        };
        ep = endpoints[freeProvider] || '';
      }

      const res = await window.electronAPI.aiChat(
        [ctxMsg, ...messages.map(m => ({ role: m.role, content: m.content })), userMsg],
        apiKey, model, ep, undefined, filePath
      );

      if (res.success) {
        setMessages(prev => [...prev, { role: 'assistant', content: res.message.content }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${res.error}` }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${(err as Error).message}` }]);
    }
    setLoading(false);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="inline-chat">
      <div className="inline-chat-header">
        <span className="inline-chat-title">💬 Chat: {filePath.split('/').pop()}</span>
        <button className="inline-chat-close" onClick={onClose} title="Close">
          <IconX size={14} />
        </button>
      </div>
      <div className="inline-chat-messages">
        {messages.map((msg, i) => {
          const toolCard = parseToolCard(msg.content);
          return (
            <div key={i} className={`inline-chat-msg ${msg.role}`}>
              <span className="inline-chat-msg-label">{msg.role === 'user' ? 'You' : 'AI'}</span>
              {toolCard ? (
                <span className="inline-chat-msg-tool-card">
                  ⚙️ Successfully updated <code>{toolCard}</code>
                </span>
              ) : (
                <span className="inline-chat-msg-text">{renderMarkdown(msg.content)}</span>
              )}
            </div>
          );
        })}
        {loading && <div className="inline-chat-msg assistant"><span className="inline-chat-msg-text ai-thinking">Thinking...</span></div>}
        <div ref={bottomRef} />
      </div>
      <div className="inline-chat-input-row">
        <textarea
          className="inline-chat-input"
          placeholder="Ask about this file..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          rows={1}
        />
        <button
          className="inline-chat-send"
          onClick={sendMessage}
          disabled={loading || !input.trim()}
        >
          <IconSend size={14} />
        </button>
      </div>
    </div>
  );
};

export default InlineChat;
