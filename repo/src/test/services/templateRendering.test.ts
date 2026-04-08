/**
 * Tests for renderTemplate and template-backed composeOutboundMessage.
 *
 * Verifies:
 *   - Placeholder substitution with provided values
 *   - Unknown placeholders are left as-is ({{varName}})
 *   - Empty variables map is handled gracefully
 *   - composeOutboundMessage uses the template when templateKey is set
 *   - Non-existent / inactive template key queues message without subject/body override
 *
 * Evidence: src/services/notificationService.ts:111–121, :150–186
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import { renderTemplate, composeOutboundMessage } from '@/services/notificationService'
import { useAuthStore } from '@/store/authStore'
import { generateId } from '@/crypto'
import { Role } from '@/types'
import type { NotificationTemplate } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTemplate(overrides: Partial<NotificationTemplate> = {}): NotificationTemplate {
  const now = Date.now()
  return {
    id: generateId(),
    key: 'auction.outbid',
    name: 'Outbid Notice',
    subjectTemplate: 'You were outbid on {{itemName}}',
    bodyTemplate: 'Hi {{userName}}, your bid of {{bidAmount}} on {{itemName}} has been surpassed.',
    variables: ['userName', 'bidAmount', 'itemName'],
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  useAuthStore.setState({
    currentUser: {
      id: 'test-user', username: 'test', displayName: 'Test', role: Role.Administrator,
      email: 'test@test', passwordHash: '', passwordSalt: '', isActive: true, isTemporaryPassword: false,
      createdAt: 0, updatedAt: 0, createdBy: 'system',
    },
    isLoading: false,
  })
  await Promise.all([
    db.notificationTemplates.clear(),
    db.outboundQueue.clear(),
  ])
})

// ── renderTemplate unit tests ─────────────────────────────────────────────────

describe('renderTemplate', () => {
  it('substitutes all provided variables', () => {
    const tpl = makeTemplate()
    const { subject, body } = renderTemplate(tpl, {
      userName: 'Alice',
      bidAmount: '$500',
      itemName: 'Vintage Clock',
    })
    expect(subject).toBe('You were outbid on Vintage Clock')
    expect(body).toBe('Hi Alice, your bid of $500 on Vintage Clock has been surpassed.')
  })

  it('leaves unknown placeholders intact', () => {
    const tpl = makeTemplate()
    const { subject } = renderTemplate(tpl, { itemName: 'Lamp' })
    // {{userName}} and {{bidAmount}} not provided — should remain
    expect(subject).toBe('You were outbid on Lamp')
    expect(subject).not.toContain('undefined')
  })

  it('handles empty variables map without throwing', () => {
    const tpl = makeTemplate()
    const { subject, body } = renderTemplate(tpl, {})
    expect(subject).toBe('You were outbid on {{itemName}}')
    expect(body).toContain('{{userName}}')
  })

  it('renders template with no placeholders as-is', () => {
    const tpl = makeTemplate({
      subjectTemplate: 'System Alert',
      bodyTemplate: 'The system is undergoing maintenance.',
      variables: [],
    })
    const { subject, body } = renderTemplate(tpl, {})
    expect(subject).toBe('System Alert')
    expect(body).toBe('The system is undergoing maintenance.')
  })

  it('substitutes multiple occurrences of the same placeholder', () => {
    const tpl = makeTemplate({
      subjectTemplate: '{{name}} — notice for {{name}}',
      bodyTemplate: 'Dear {{name}}, this is for {{name}}.',
      variables: ['name'],
    })
    const { subject, body } = renderTemplate(tpl, { name: 'Bob' })
    expect(subject).toBe('Bob — notice for Bob')
    expect(body).toBe('Dear Bob, this is for Bob.')
  })
})

// ── composeOutboundMessage with templateKey ─────────────────────────────────────

describe('composeOutboundMessage — template rendering', () => {
  it('uses template subject and body when templateKey is provided', async () => {
    const tpl = makeTemplate()
    await db.notificationTemplates.add(tpl)

    await composeOutboundMessage({
      channel: 'Email',
      recipientUserId: 'user-1',
      recipientAddress: 'alice@example.com',
      templateKey: tpl.key,
      templateVariables: { userName: 'Alice', bidAmount: '$300', itemName: 'Vase' },
    })

    const items = await db.outboundQueue.toArray()
    expect(items).toHaveLength(1)
    expect(items[0].subject).toBe('You were outbid on Vase')
    expect(items[0].body).toBe('Hi Alice, your bid of $300 on Vase has been surpassed.')
  })

  it('stores the templateKey on the queued item', async () => {
    const tpl = makeTemplate()
    await db.notificationTemplates.add(tpl)

    await composeOutboundMessage({
      channel: 'SMS',
      recipientUserId: 'user-2',
      recipientAddress: '+15550001234',
      templateKey: tpl.key,
      templateVariables: { userName: 'Bob', bidAmount: '$100', itemName: 'Lamp' },
    })

    const [item] = await db.outboundQueue.toArray()
    expect(item.templateKey).toBe(tpl.key)
  })

  it('falls back to empty body when templateKey does not match any active template', async () => {
    await composeOutboundMessage({
      channel: 'Email',
      recipientUserId: 'user-3',
      recipientAddress: 'ghost@example.com',
      templateKey: 'auction.won', // no template in DB
    })

    const [item] = await db.outboundQueue.toArray()
    expect(item.body).toBe('')
    expect(item.subject).toBeUndefined()
  })

  it('skips inactive templates', async () => {
    const tpl = makeTemplate({ isActive: false })
    await db.notificationTemplates.add(tpl)

    await composeOutboundMessage({
      channel: 'Email',
      recipientUserId: 'user-4',
      recipientAddress: 'x@example.com',
      templateKey: tpl.key,
      templateVariables: { userName: 'X', bidAmount: '$1', itemName: 'Y' },
    })

    const [item] = await db.outboundQueue.toArray()
    // No template rendered — subject and body should be empty/undefined
    expect(item.subject).toBeUndefined()
    expect(item.body).toBe('')
  })

  it('queues with status Queued when no scheduledAt', async () => {
    const tpl = makeTemplate()
    await db.notificationTemplates.add(tpl)

    await composeOutboundMessage({
      channel: 'Email',
      recipientUserId: 'user-5',
      recipientAddress: 'u5@example.com',
      templateKey: tpl.key,
      templateVariables: { userName: 'U5', bidAmount: '$50', itemName: 'Rug' },
    })

    const [item] = await db.outboundQueue.toArray()
    expect(item.status).toBe('Queued')
  })
})
