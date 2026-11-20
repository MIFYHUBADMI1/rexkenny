"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Send, Trash2 } from "lucide-react";
import {
  clearAssistantHistoryAction,
  sendAssistantMessageAction,
  type ChatTurn,
} from "@/actions/ai";

export type ChatMessageView = ChatTurn & { at?: string };

const SUGGESTIONS = [
  "I'm new here — help me get set up",
  "What still needs configuring?",
  "How do I add my first release?",
  "How do I write release copy with AI?",
];

/**
 * The admin assistant chat. History is owned by the server (persistent memory
 * in ai_chat_messages when migration 0012 is applied); the client keeps a copy
 * purely so the thread renders without a refetch, and sends it back only as
 * fallback context when the table is unreachable.
 */
export function AssistantChat({
  initialMessages,
  initialMemory,
  aiEnabled,
}: {
  initialMessages: ChatMessageView[];
  initialMemory: "persistent" | "session" | "off";
  aiEnabled: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessageView[]>(initialMessages);
  const [memory, setMemory] = useState(initialMemory);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    });
  };

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setInput("");
    setError(null);
    const next: ChatMessageView[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    scrollToEnd();
    startTransition(async () => {
      const r = await sendAssistantMessageAction(trimmed, next);
      if (!r.ok) {
        setError(r.message);
        // Take the unanswered question back out so the thread stays honest.
        setMessages((prev) => prev.slice(0, -1));
        setInput(trimmed);
        return;
      }
      setMemory(r.memory);
      setMessages((prev) => [...prev, { role: "assistant", content: r.reply }]);
      scrollToEnd();
    });
  };

  const clear = () => {
    startTransition(async () => {
      const r = await clearAssistantHistoryAction();
      if (r.ok) {
        setMessages([]);
        setMemory("persistent");
      } else {
        setError(r.message);
      }
    });
  };

  return (
    <div className="flex min-h-[28rem] flex-col rounded-lg border border-charcoal bg-ink-raised">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-charcoal px-4 py-3">
        <p className="text-xs text-smoke">
          {memory === "persistent"
            ? "Memory: this conversation is saved to your account and survives sign-out."
            : memory === "session"
              ? "Memory: kept for this visit only — apply migration 0012 to make it permanent."
              : "Memory: not stored — the messages table is missing or the database is unreachable."}
        </p>
        {messages.length > 0 ? (
          <button
            type="button"
            onClick={clear}
            disabled={pending}
            className="inline-flex items-center gap-1.5 text-xs text-smoke transition hover:text-blood"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Clear conversation
          </button>
        ) : null}
      </div>

      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5" style={{ maxHeight: "32rem" }}>
        {messages.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-smoke">
              Ask about the catalogue, the release workflow, or what still needs
              doing. If this is your first time in the dashboard, start with the
              suggestions below — the assistant walks you through one step at a
              time.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  disabled={!aiEnabled || pending}
                  className="rounded-full border border-ash px-3 py-1.5 text-xs text-mist transition hover:border-gold hover:text-gold disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-gold/15 text-paper"
                    : "border border-charcoal bg-ink text-mist"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))
        )}
        {pending ? (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-lg border border-charcoal bg-ink px-4 py-2.5 text-sm text-smoke">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Thinking
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="border-t border-blood/30 bg-blood/5 px-4 py-2.5 text-xs text-blood">
          {error}
        </p>
      ) : null}

      <form
        className="flex items-end gap-3 border-t border-charcoal p-4"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder={aiEnabled ? "Ask about the catalogue or setup…" : "The assistant is not configured yet"}
          disabled={!aiEnabled || pending}
          className="w-full flex-1 rounded-md border border-ash bg-ink px-3 py-2 text-sm text-paper placeholder:text-smoke/70 focus:border-gold focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!aiEnabled || pending || input.trim() === ""}
          className="btn-gold inline-flex shrink-0 items-center gap-2"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" aria-hidden />
          Send
        </button>
      </form>
    </div>
  );
}
