import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { IpadComposer, type MobileComposerSelection } from './ipad-session-detail'

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
