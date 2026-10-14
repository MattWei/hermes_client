import type { FormEvent } from 'react'

import { MarkdownTextContent } from './components/assistant-ui/markdown-text'
import { chatMessageText, type ChatMessage } from './lib/chat-messages'
import type { MobileApprovalRequest } from './mobile-approval-client'
import type { MobileToolActivity } from './mobile-tool-activity-client'

interface IpadComposerProps {
  draft: string
  onDraftChange: (value: string) => void
  onFilesChange: (files: File[]) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  pendingFiles: File[]
  sessionId: string | null
}

/** Message composer, shared by the offline surface and the session detail view. */
export function IpadComposer({ draft, onDraftChange, onFilesChange, onSubmit, pendingFiles, sessionId }: IpadComposerProps) {
  return (
    <form className="mt-auto shrink-0 border-t border-(--ui-stroke-tertiary) pt-4" onSubmit={onSubmit}>
      {pendingFiles.length > 0 && <div aria-label="Pending attachments" className="mb-2 flex flex-wrap gap-2">
        {pendingFiles.map((file, index) => <button className="rounded-lg border border-(--ui-stroke-tertiary) px-2 py-1 text-sm" key={`${file.name}-${index}`} onClick={() => onFilesChange(pendingFiles.filter((_, itemIndex) => itemIndex !== index))} type="button">Remove {file.name}</button>)}
      </div>}
      <input aria-label="Attach file" className="sr-only" disabled={!sessionId} id="ipad-attachment" multiple onChange={event => onFilesChange([...pendingFiles, ...Array.from(event.target.files ?? [])])} type="file" />
      <label className="sr-only" htmlFor="ipad-message">Message composer</label>
      <div className="flex items-end gap-3 rounded-2xl bg-[var(--ui-bg-quaternary)] p-3">
        <label
          aria-disabled={!sessionId}
          className={`shrink-0 cursor-pointer rounded-xl border border-(--ui-stroke-tertiary) px-3 py-2 text-sm ${sessionId ? '' : 'pointer-events-none opacity-40'}`}
          htmlFor="ipad-attachment"
        >
          Attach
        </label>
        <textarea
          aria-label="Message composer"
          className="min-h-14 flex-1 resize-none bg-transparent px-1 py-2 text-base outline-none placeholder:text-[color:var(--ui-text-tertiary)]"
          disabled={!sessionId}
          id="ipad-message"
          onChange={event => onDraftChange(event.target.value)}
          placeholder={sessionId ? 'Message Hermes' : 'Create a session to start a conversation'}
          rows={2}
          value={draft}
        />
        <button aria-label="Send message" className="shrink-0 rounded-xl bg-[var(--ui-text-primary)] px-4 py-2 text-sm font-medium text-background disabled:opacity-40" disabled={!sessionId || (!draft.trim() && pendingFiles.length === 0)} type="submit">Send</button>
      </div>
    </form>
  )
}

interface IpadSessionDetailProps {
  approval: MobileApprovalRequest | null
  draft: string
  messages: ChatMessage[]
  onDraftChange: (value: string) => void
  onFilesChange: (files: File[]) => void
  onRespondToApproval: (choice: 'deny' | 'once') => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  pendingFiles: File[]
  sessionId: string | null
  toolActivities: MobileToolActivity[]
}

/** Mobile session detail view: one conversation, with a way back to the list. */
export function IpadSessionDetail({
  approval, draft, messages, onDraftChange, onFilesChange, onRespondToApproval, onSubmit, pendingFiles, sessionId, toolActivities
}: IpadSessionDetailProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {approval && <section aria-label="Approval request" className="mt-4 shrink-0 rounded-xl border border-amber-500/50 p-3">
        <p className="font-medium">Approval required</p>
        {approval.description && <p className="mt-1 text-sm">{approval.description}</p>}
        {approval.command && <pre className="mt-2 overflow-x-auto text-sm">{approval.command}</pre>}
        <div className="mt-3 flex gap-2">
          <button onClick={() => onRespondToApproval('once')} type="button">Allow once</button>
          <button onClick={() => onRespondToApproval('deny')} type="button">Deny</button>
        </div>
      </section>}

      {toolActivities.length > 0 && <section aria-label="Tool activity" className="flex shrink-0 flex-col gap-2 py-4">
        <p className="font-mono text-xs tracking-[0.14em] text-[color:var(--ui-text-tertiary)]">TOOL ACTIVITY</p>
        {toolActivities.map(activity => <p className="rounded-xl border border-(--ui-stroke-tertiary) px-3 py-2 text-sm" key={activity.id}>{activity.name} · {activity.status}</p>)}
      </section>}

      {messages.length > 0 && <section aria-label="Conversation" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-6 [&_pre]:overflow-x-auto [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto">
        {messages.map(message => <article
          className={message.role === 'user'
            ? 'max-w-[85%] self-end rounded-2xl bg-[var(--ui-bg-quaternary)] px-3 py-2'
            : 'min-w-0 max-w-full self-start'}
          key={message.id}
        >
          <MarkdownTextContent isRunning={Boolean(message.pending)} text={chatMessageText(message)} />
        </article>)}
      </section>}

      <IpadComposer
        draft={draft}
        onDraftChange={onDraftChange}
        onFilesChange={onFilesChange}
        onSubmit={onSubmit}
        pendingFiles={pendingFiles}
        sessionId={sessionId}
      />
    </div>
  )
}
