import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import HomePage, { FAQ } from './HomePage.jsx'
import { FLOW_STEPS } from './SignalFlow.jsx'

afterEach(cleanup)

describe('homepage', () => {
  it('covers the required topics and the official-guidance notice', () => {
    render(<HomePage />)
    for (const name of [/warning time is short/, /tremor on the riverbank/, /where the network can and cannot see/, /right language/, /What BhuDrishti is not/, /Common questions/]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeTruthy()
    }
    expect(screen.getByRole('note').textContent).toMatch(/NDRRMA, DHM/)
    expect(screen.getAllByText('Hypothetical').length).toBe(3)
    expect(screen.getByText(/Simulated · demo seed/)).toBeTruthy()
  })

  it('toggles the mobile menu and closes it with Escape', () => {
    render(<HomePage />)
    const button = screen.getByRole('button', { name: 'Open menu' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById('mobile-menu').hidden).toBe(false)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(document.getElementById('mobile-menu').hidden).toBe(true)
  })

  it('steps through the sensor-to-alert flow with buttons and arrow keys', () => {
    render(<HomePage />)
    const list = screen.getByRole('tablist', { name: 'Sensor-to-alert steps' })
    const tabs = within(list).getAllByRole('tab')
    expect(tabs).toHaveLength(FLOW_STEPS.length)
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(tabs[0], { key: 'ArrowDown' })
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(tabs[1], { key: 'End' })
    expect(screen.getByRole('tabpanel').textContent).toMatch(/Notify/)
    fireEvent.click(screen.getByRole('tab', { name: /Human review/ }))
    expect(screen.getByRole('tabpanel').textContent).toMatch(/awaiting operator approval/)
  })

  it('expands process cards and FAQ items one at a time', () => {
    render(<HomePage />)
    const phone = screen.getByRole('button', { name: /Phone sensor contributions/ })
    expect(phone.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(phone)
    expect(phone.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: /ESP32 field nodes/ }).getAttribute('aria-expanded')).toBe('false')

    const q1 = screen.getByRole('button', { name: FAQ[0].q })
    const q2 = screen.getByRole('button', { name: FAQ[1].q })
    fireEvent.click(q1)
    expect(q1.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(q2)
    expect(q1.getAttribute('aria-expanded')).toBe('false')
    expect(q2.getAttribute('aria-expanded')).toBe('true')
  })

  it('switches coverage scenarios and notice-preview language', () => {
    render(<HomePage />)
    const map = () => screen.getByRole('img', { name: /Coverage preview/ }).getAttribute('aria-label')
    const before = map()
    fireEvent.click(screen.getByRole('radio', { name: '+ Phone layer' }))
    expect(map()).toMatch(/\+ Phone layer/)
    expect(map()).not.toBe(before)

    const lang = screen.getByRole('radiogroup', { name: 'Preview language' })
    fireEvent.click(within(lang).getByRole('radio', { name: 'English' }))
    expect(screen.getByText(/Advisory: unusual ground vibration detected near Syabrubesi/)).toBeTruthy()
  })

  it('links portal deep links from the footer', () => {
    render(<HomePage />)
    const nav = screen.getByRole('navigation', { name: 'Portal shortcuts' })
    expect(within(nav).getByRole('link', { name: 'Agents' }).getAttribute('href')).toBe('#agents')
    expect(within(nav).getByRole('link', { name: 'Coverage map' }).getAttribute('href')).toBe('#map')
  })
})
