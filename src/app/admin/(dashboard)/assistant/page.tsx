import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { buildMetadata } from "@/lib/seo/metadata";
import { requireStaff } from "@/lib/auth/session";
import { aiStatus } from "@/lib/ai/client";
import { listAssistantHistory } from "@/lib/ai/store";
import { integrationStates, isAiConfigured } from "@/lib/config";
import { AssistantChat, type ChatMessageView } from "@/components/admin/AssistantChat";
import { FormNote, Panel } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Assistant",
    description: "Ask the dashboard assistant about the catalogue and setup.",
    path: "/admin/assistant",
    noindex: true,
  });
}

export default async function AssistantPage() {
  const session = await requireStaff("/admin/assistant");
  const status = aiStatus();

  const history = await listAssistantHistory(session.userId);
  const initialMessages: ChatMessageView[] = history.ok
    ? history.messages.map((m) => ({
        role: m.role,
        content: m.content,
        at: m.createdAt,
      }))
    : [];
  const initialMemory = history.ok ? "persistent" : history.offline ? "off" : "session";

  const integrations = integrationStates();
  const missing = integrations.filter((s) => !s.configured);
  const firstRun = history.ok && history.messages.length === 0;

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">Assistant</p>
        <h1 className="mt-2 flex items-center gap-3 font-[family-name:var(--font-display)] text-4xl font-black">
          <Sparkles className="h-8 w-8 text-gold" aria-hidden />
          Assistant
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-smoke">
          Ask about the catalogue, the release workflow, or what still needs doing.
          The assistant reads your live database before every answer, and this
          conversation is remembered between visits. It drafts suggestions only —
          every write still goes through the normal admin forms.
        </p>
      </header>

      {!isAiConfigured ? (
        <FormNote>
          The assistant is not configured on this deployment ({status.missing}).
          The chat stays closed until AI_PROVIDER, AI_MODEL and AI_API_KEY are set
          in the server environment — see{" "}
          <Link href="/admin/setup" className="text-gold underline underline-offset-4">
            setup status
          </Link>
          .
        </FormNote>
      ) : null}

      {firstRun ? (
        <Panel
          title="First time here?"
          description="A short path through the dashboard, in order. The assistant can walk you through any of these."
        >
          <ol className="space-y-2 text-sm leading-relaxed text-mist">
            <li>
              1.{" "}
              <Link href="/admin/setup" className="text-gold underline underline-offset-4">
                Check setup status
              </Link>{" "}
              — {missing.length === 0
                ? "every integration reports configured."
                : `${missing.length} integration${missing.length === 1 ? "" : "s"} still offline: ${missing
                    .map((m) => m.label)
                    .join(", ")}.`}
            </li>
            <li>
              2.{" "}
              <Link href="/admin/releases/new" className="text-gold underline underline-offset-4">
                Create your first release
              </Link>{" "}
              — start as a draft; it stays invisible publicly until released.
            </li>
            <li>
              3. On that form, use <strong>Draft with AI</strong> to write the
              description and artwork alt text, then review before saving.
            </li>
            <li>
              4.{" "}
              <Link href="/admin/music" className="text-gold underline underline-offset-4">
                Upload music
              </Link>{" "}
              once the release exists.
            </li>
          </ol>
        </Panel>
      ) : null}

      <AssistantChat
        initialMessages={initialMessages}
        initialMemory={initialMemory}
        aiEnabled={isAiConfigured}
      />

      <p className="text-xs leading-relaxed text-smoke">
        Provider: {status.provider}
        {status.model ? ` · model ${status.model}` : ""}. The key stays on the
        server and is never sent to the browser. Conversations are stored per
        staff account and can be cleared above.
      </p>
    </div>
  );
}
