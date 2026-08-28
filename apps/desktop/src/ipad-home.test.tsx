import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { IpadHome } from './ipad-home'

describe('IpadHome', () => {
  it('shows the offline Hermes home without starting a backend', () => {
    render(<IpadHome />)

    expect(screen.getByRole('heading', { name: 'Hermes' })).toBeTruthy()
    expect(screen.getByText('Your remote workspace')).toBeTruthy()
    expect(screen.getByText('Backend not connected')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Message composer' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send message' }).hasAttribute('disabled')).toBe(true)
  })
})
