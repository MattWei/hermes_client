import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { IpadComposer, IpadSessionDetail, type MobileComposerSelection } from './ipad-session-detail'
import type { ChatMessage } from './lib/chat-messages'

function selection(overrides: Partial<MobileComposerSelection> = {}): MobileComposerSelection {
  return {
    effortLabel: 'Med',
    effortOptions: [{
      id: '',
      items: [
        { id: 'low', label: 'Low' },
        { id: 'medium', label: 'Med' },
        { id: 'high', label: 'High' }
      ],
      label: ''
    }],
    effortValue: 'medium',
    modelGroup: 'deepseek',
    modelLabel: 'DeepSeek V4 Flash',
    modelOptions: [
      {
        id: 'deepseek',
        items: [{ id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash' }],
        label: 'deepseek'
      },
      {
        id: 'anthropic',
        items: [{ id: 'claude-sonnet-4-8', label: 'Claude Sonnet 4.8' }],
        label: 'anthropic'
      }
    ],
    modelValue: 'deepseek/deepseek-v4-flash',
    onSelectEffort: vi.fn(),
    onSelectModel: vi.fn(),
    ...overrides
  }
}

function renderComposer(current = selection()) {
  return render(<IpadComposer
    draft=""
    onDraftChange={vi.fn()}
    onFilesChange={vi.fn()}
    onSubmit={vi.fn()}
    onVoiceInput={vi.fn()}
    pendingFiles={[]}
    selection={current}
    sessionId="runtime-1"
    voiceState="idle"
  />)
}

describe('composer selectors', () => {
  it('groups the model menu by provider', () => {
    renderComposer()

    fireEvent.click(screen.getByRole('button', { name: 'Model' }))

    const menu = screen.getByRole('menu')
    // A model id alone does not say which listing to search, so the provider is the menu's spine.
    expect(within(menu).getByText('deepseek')).toBeTruthy()
    expect(within(menu).getByText('anthropic')).toBeTruthy()
    expect(within(menu).getByText('Claude Sonnet 4.8')).toBeTruthy()
  })

  it('marks the model in force, and only that one', () => {
    renderComposer()

    fireEvent.click(screen.getByRole('button', { name: 'Model' }))

    const checked = within(screen.getByRole('menu'))
      .getAllByRole('menuitemradio')
      .filter(item => item.getAttribute('aria-checked') === 'true')

    expect(checked).toHaveLength(1)
    expect(checked[0].textContent).toContain('DeepSeek V4 Flash')
  })

  it('carries the provider of the row that was picked', () => {
    const current = selection()
    renderComposer(current)

    fireEvent.click(screen.getByRole('button', { name: 'Model' }))
    fireEvent.click(screen.getByText('Claude Sonnet 4.8'))

    expect(current.onSelectModel).toHaveBeenCalledWith('claude-sonnet-4-8', 'anthropic')
  })

  it('closes when the person taps somewhere else', () => {
    renderComposer()

    fireEvent.click(screen.getByRole('button', { name: 'Model' }))
    expect(screen.getByRole('menu')).toBeTruthy()

    // A menu that only closes on a second tap of its own trigger reads as stuck.
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('stays open when the tap lands inside the list', () => {
    renderComposer()

    fireEvent.click(screen.getByRole('button', { name: 'Model' }))
    fireEvent.pointerDown(screen.getByRole('menu'))

    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('marks the level in force and closes on a pick', () => {
    const current = selection()
    renderComposer(current)

    fireEvent.click(screen.getByRole('button', { name: 'Thinking level' }))
    const checked = screen.getAllByRole('menuitemradio')
      .filter(item => item.getAttribute('aria-checked') === 'true')

    expect(checked.map(item => item.textContent?.trim())).toEqual(['Med'])

    fireEvent.click(screen.getByText('High'))

    expect(current.onSelectEffort).toHaveBeenCalledWith('high')
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('opening a session', () => {
  function detail(lastMessage: ChatMessage, sessionId = 'session-a') {
    return <IpadSessionDetail
      approval={null}
      draft=""
      messages={[lastMessage]}
      onDraftChange={vi.fn()}
      onFilesChange={vi.fn()}
      onRespondToApproval={vi.fn()}
      onSubmit={vi.fn()}
      onVoiceInput={vi.fn()}
      pendingFiles={[]}
      selection={selection()}
      sessionId={sessionId}
      toolActivities={[]}
      voiceState="idle"
    />
  }

  const first: ChatMessage = { id: 'm1', parts: [{ text: 'first', type: 'text' }], role: 'assistant' }
  const second: ChatMessage = { id: 'm2', parts: [{ text: 'second', type: 'text' }], role: 'user' }
  const reply: ChatMessage = { id: 'm3', parts: [{ text: 'third', type: 'text' }], role: 'assistant' }

  function renderDetail(sessionId: string) {
    return render(detail(first, sessionId))
  }

  it('opens at the end of the conversation, not at its first message', () => {
    const { rerender } = renderDetail('session-a')
    const conversation = screen.getByLabelText('Conversation')
    Object.defineProperty(conversation, 'scrollHeight', { configurable: true, value: 900 })

    // Switching session arms the tail again; this is what a resumed conversation looks like.
    rerender(detail(first, 'session-b'))

    expect(conversation.scrollTop).toBe(900)
  })

  it('follows the turn again once a message is sent, even from the middle of the history', () => {
    const { rerender } = renderDetail('session-a')
    const conversation = screen.getByLabelText('Conversation')
    Object.defineProperty(conversation, 'scrollHeight', { configurable: true, value: 900 })
    Object.defineProperty(conversation, 'clientHeight', { configurable: true, value: 200 })

    // Reading history: far from the bottom.
    conversation.scrollTop = 0
    fireEvent.scroll(conversation)
    rerender(detail(first))
    expect(conversation.scrollTop).toBe(0)

    // Sending is a request to watch the answer, so the tail is re-armed.
    rerender(detail(second))

    expect(conversation.scrollTop).toBe(900)
  })

  it('comes back to the answer that arrived while the person was reading', () => {
    const { rerender } = renderDetail('session-a')
    const conversation = screen.getByLabelText('Conversation')
    Object.defineProperty(conversation, 'scrollHeight', { configurable: true, value: 900 })
    Object.defineProperty(conversation, 'clientHeight', { configurable: true, value: 200 })

    // Scrolled up mid-turn: the reply must not be missed because of that.
    conversation.scrollTop = 0
    fireEvent.scroll(conversation)
    rerender(detail(second))
    expect(conversation.scrollTop).toBe(900)

    conversation.scrollTop = 0
    fireEvent.scroll(conversation)
    rerender(detail(reply))

    expect(conversation.scrollTop).toBe(900)
  })

  it('keeps a turn\'s tool activity inside the transcript', () => {
    render(<IpadSessionDetail
      approval={null}
      draft=""
      messages={[{ id: 'm1', parts: [{ text: 'first', type: 'text' }], role: 'assistant' }]}
      onDraftChange={vi.fn()}
      onFilesChange={vi.fn()}
      onRespondToApproval={vi.fn()}
      onSubmit={vi.fn()}
      onVoiceInput={vi.fn()}
      pendingFiles={[]}
      selection={selection()}
      sessionId="session-a"
      toolActivities={[{ id: 't1', name: 'terminal', status: 'complete' }]}
      voiceState="idle"
    />)

    const conversation = screen.getByLabelText('Conversation')
    // Above the transcript it pushed the conversation down and read as history from the session's start.
    expect(conversation.contains(screen.getByLabelText('Tool activity'))).toBe(true)
  })
})
