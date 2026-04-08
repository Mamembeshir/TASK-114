import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from '../App'

describe('App', () => {
  it('renders the Meridian Portal heading', async () => {
    // App starts unauthenticated and renders the LoginPage after init
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('Meridian Portal')).toBeInTheDocument()
    })
  })
})
