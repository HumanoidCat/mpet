import { useState } from 'react';
import { createMockAIPipeline } from '@mocks/mockAIPipeline';
import type { ChatMessage } from '@shared/contracts';

/**
 * App shell temporal (Semana 1). Demuestra el flujo con mocks.
 * Cada módulo lo irá reemplazando: ui/chat (Monestel), core/orchestrator (Alejandro).
 */
const ai = createMockAIPipeline();

export function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);

  async function simulateTurn() {
    setBusy(true);
    const tr = await ai.transcribe(new Float32Array(0));
    const corr = await ai.correctGrammar(tr.text);
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(), role: 'user', text: tr.text, correction: corr, ts: Date.now(),
    };
    const replyText = await ai.reply([userMsg]);
    const tutorMsg: ChatMessage = {
      id: crypto.randomUUID(), role: 'tutor', text: replyText, ts: Date.now(),
    };
    setMessages((m) => [...m, userMsg, tutorMsg]);
    setBusy(false);
  }

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 640, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>My Personal English Teacher</h1>
      <p><em>Semana 1 — app shell con mocks. Ver docs/ para el plan.</em></p>
      <button onClick={simulateTurn} disabled={busy}>
        {busy ? 'Procesando...' : 'Simular turno de conversacion (mock)'}
      </button>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {messages.map((m) => (
          <li key={m.id} style={{ margin: '0.5rem 0', textAlign: m.role === 'user' ? 'right' : 'left' }}>
            <span style={{
              display: 'inline-block', padding: '0.5rem 0.75rem', borderRadius: 12,
              background: m.role === 'user' ? '#dbeafe' : '#dcfce7',
            }}>
              <strong>{m.role === 'user' ? 'Tú' : 'Tutor'}:</strong> {m.text}
              {m.correction && m.correction.edits.length > 0 && (
                <div style={{ fontSize: '0.85em', marginTop: 4 }}>
                  <s>{m.correction.edits[0].original}</s> {'->'} <b>{m.correction.edits[0].corrected}</b>
                </div>
              )}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
