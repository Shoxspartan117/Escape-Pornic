import { useState } from 'react';
import type { GameMessage } from '../services/adminService';

interface GameMessageOverlayProps {
  messages: GameMessage[];
  error: string | null;
  onAcknowledge: (messageId: string) => Promise<void>;
}

export default function GameMessageOverlay({ messages, error, onAcknowledge }: GameMessageOverlayProps) {
  const [pending, setPending] = useState(false);
  const [acknowledgementError, setAcknowledgementError] = useState<string | null>(null);
  const message = messages[0];
  if (!message) {
    return error
      ? <p role="alert" className="panel absolute bottom-20 left-3 right-3 z-[1700] p-3 text-xs text-alert">{error}</p>
      : null;
  }

  const acknowledge = async () => {
    setPending(true);
    setAcknowledgementError(null);
    try {
      await onAcknowledge(message.id);
    } catch (cause) {
      setAcknowledgementError(cause instanceof Error ? cause.message : 'Impossible d’acquitter ce message.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[1700] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="game-message-title" className="panel w-full max-w-md space-y-4 p-5 text-neon">
        <p className="text-[10px] tracking-[0.3em] text-signal">COMMUNICATION DE L’OPÉRATION</p>
        <h2 id="game-message-title" className="holo-text text-xl font-bold">{message.title}</h2>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-neon/80">{message.body}</p>
        {(error || acknowledgementError) && <p role="alert" className="text-xs text-alert">{acknowledgementError ?? error}</p>}
        <button type="button" className="btn-neon min-h-12 w-full" disabled={pending} onClick={() => void acknowledge()}>
          {pending ? 'ENREGISTREMENT…' : 'J’AI REÇU LE MESSAGE'}
        </button>
      </section>
    </div>
  );
}
