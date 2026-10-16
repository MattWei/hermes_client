import { useEffect, useRef, type FormEvent, type KeyboardEvent } from 'react'

import { MarkdownTextContent } from './components/assistant-ui/markdown-text'
import { Codicon } from './components/ui/codicon'
import { chatMessageText, type ChatMessage } from './lib/chat-messages'
import type { MobileApprovalRequest } from './mobile-approval-client'
import type { MobileToolActivity } from './mobile-tool-activity-client'

/** Recording is a two-tap gesture, so the composer has to show which half of it it is in. */
export type MobileVoiceState = 'idle' | 'recording' | 'transcribing'

interface IpadComposerProps {
  draft: string
  onDraftChange: (value: string) => void
  onFilesChange: (files: File[]) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onVoiceInput: () => void
  pendingFiles: File[]
  sessionId: string | null
  voiceState: MobileVoiceState
}

/** Message composer, shared by the offline surface and the session detail view. */
export function IpadComposer({ draft, onDraftChange, onFilesChange, onSubmit, onVoiceInput, pendingFiles, sessionId, voiceState }: IpadComposerProps) {
  const fieldRef = useRef<HTMLTextAreaElement>(null)

  /**
   * One row tall until the text needs more. Reset to `auto` first — measuring against the height the
   * previous keystroke set can only ever grow the box, never shrink it back.
   */
  useEffect(() => {
    const field = fieldRef.current
    if (!field) {
      return
    }
    field.style.height = 'auto'
    field.style.height = `${field.scrollHeight}px`
  }, [draft])

  /**
   * Enter sends; Shift+Enter breaks the line. The composition check matters more than it looks on a
   * Latin keyboard: an IME uses Enter to commit a candidate, and sending on that Enter would fire
   * half-typed text at the model.
   */
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return
    }
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  const hasContent = draft.trim().length > 0 || pendingFiles.length > 0

  return (
    <form className="mt-auto shrink-0 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]" onSubmit={onSubmit}>
      {pendingFiles.length > 0 && <div aria-label="Pending attachments" className="mb-2 flex flex-wrap gap-2">
        {pendingFiles.map((file, index) => <button className="rounded-lg border border-(--ui-stroke-tertiary) px-2 py-1 text-sm" key={`${file.name}-${index}`} onClick={() => onFilesChange(pendingFiles.filter((_, itemIndex) => itemIndex !== index))} type="button">Remove {file.name}</button>)}
      </div>}
      <input aria-label="Attach file" className="sr-only" disabled={!sessionId} id="ipad-attachment" multiple onChange={event => onFilesChange([...pendingFiles, ...Array.from(event.target.files ?? [])])} type="file" />
      <label className="sr-only" htmlFor="ipad-message">Message composer</label>
      <div className="flex items-end gap-2 rounded-2xl bg-background px-2.5 py-1">
        <label
          aria-disabled={!sessionId}
          className={`shrink-0 cursor-pointer rounded-xl border border-(--ui-stroke-tertiary) p-2 ${sessionId ? '' : 'pointer-events-none opacity-40'}`}
          htmlFor="ipad-attachment"
        >
          <Codicon name="add" size="1rem" />
        </label>
        <textarea
          aria-label="Message composer"
          className="max-h-40 flex-1 resize-none overflow-y-auto bg-transparent px-1 py-1.5 text-base outline-none placeholder:text-[color:var(--ui-text-tertiary)]"
          disabled={!sessionId}
          id="ipad-message"
          onChange={event => onDraftChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={sessionId ? 'Message Hermes' : 'Create a session to start a conversation'}
          ref={fieldRef}
          rows={1}
          value={draft}
        />
        {hasContent ? <button
          aria-label="Send message"
          className="shrink-0 rounded-xl bg-[var(--ui-text-primary)] p-2 text-background disabled:opacity-40"
          disabled={!sessionId}
          type="submit"
        >
          <Codicon name="arrow-up" size="0.875rem" />
        </button> : <button
          aria-label={voiceState === 'recording' ? 'Stop recording' : 'Record a voice message'}
          aria-pressed={voiceState === 'recording'}
          className={`shrink-0 rounded-xl p-2 disabled:opacity-40 ${voiceState === 'recording' ? 'bg-red-500/15 text-red-500' : ''}`}
          disabled={!sessionId || voiceState === 'transcribing'}
          onClick={onVoiceInput}
          type="button"
        >
          <Codicon name={voiceState === 'recording' ? 'record' : 'mic'} size="1rem" />
        </button>}
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
  onVoiceInput: () => void
  pendingFiles: File[]
  sessionId: string | null
  toolActivities: MobileToolActivity[]
  voiceState: MobileVoiceState
}

/** Mobile session detail view: one conversation, with a way back to the list. */
export function IpadSessionDetail({
  approval, draft, messages, onDraftChange, onFilesChange, onRespondToApproval, onSubmit, onVoiceInput, pendingFiles, sessionId, toolActivities, voiceState
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
        onVoiceInput={onVoiceInput}
        pendingFiles={pendingFiles}
        sessionId={sessionId}
        voiceState={voiceState}
      />
    </div>
  )
}
