// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClickUpTask } from '../../../shared/clickup-types'
import type { AppState } from '@/store/types'
import type * as Runtime from '@/runtime/runtime-clickup-client'
import { ClickUpTaskDetailSheet } from './ClickUpTaskDetailSheet'

const mocks = vi.hoisted(() => ({
  update: vi.fn<typeof Runtime.clickUpUpdateTask>(),
  refresh: vi.fn<AppState['fetchClickUpTask']>(),
  patch: vi.fn<AppState['patchClickUpTask']>()
}))

vi.mock('@/store', () => ({
  useAppStore: (
    select: (state: Pick<AppState, 'fetchClickUpTask' | 'patchClickUpTask'>) => unknown
  ) => select({ fetchClickUpTask: mocks.refresh, patchClickUpTask: mocks.patch })
}))
vi.mock('@/runtime/runtime-clickup-client', () => ({
  clickUpUpdateTask: mocks.update,
  clickUpListLists: async () => [],
  clickUpTaskComments: async () => [],
  clickUpAddTaskComment: vi.fn()
}))

const task: ClickUpTask = {
  id: 'task-1',
  workspaceId: 'workspace-1',
  name: 'Original name',
  description: 'Plain search preview with a link',
  url: 'https://app.clickup.com/t/task-1',
  status: { name: 'in progress', color: '#1090e0', type: 'custom', orderIndex: 1 },
  priority: { id: 3, name: 'normal', color: '#87909e', orderIndex: 3 },
  dueDate: '2026-10-23T02:30:00.000Z',
  assignees: [],
  tags: [],
  list: { id: 'list-1', name: 'Backlog' },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-20T00:00:00.000Z'
}

function openTask(selected = task): void {
  render(
    <ClickUpTaskDetailSheet
      task={selected}
      sourceContext={null}
      onClose={vi.fn()}
      onStartWorkspace={vi.fn()}
      onTaskChanged={vi.fn()}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.update.mockResolvedValue({ ok: true })
  // The optimistic cache must remain lossless even when the follow-up read fails.
  mocks.refresh.mockRejectedValue(new Error('Runtime disconnected'))
})

afterEach(cleanup)

describe('ClickUp task detail saves', () => {
  it('renames a search result without rewriting its description, workflow, priority or due time', async () => {
    openTask()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Renamed task  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mocks.patch).toHaveBeenCalled())
    expect(mocks.update).toHaveBeenCalledWith(
      null,
      task.id,
      { name: 'Renamed task' },
      task.workspaceId
    )
    expect(mocks.patch).toHaveBeenCalledWith(task.id, { name: 'Renamed task' }, null)
  })

  it('does not turn missing descriptions or dates into writes when nothing changed', async () => {
    openTask({ ...task, description: undefined, dueDate: null, priority: null })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled())
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.patch).not.toHaveBeenCalled()
  })

  it('preserves explicit description and due-date clears without rewriting other fields', async () => {
    openTask()
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mocks.patch).toHaveBeenCalled())
    expect(mocks.update).toHaveBeenCalledWith(
      null,
      task.id,
      { description: '', dueDate: null },
      task.workspaceId
    )
    expect(mocks.patch).toHaveBeenCalledWith(task.id, { description: '', dueDate: null }, null)
  })

  it('leaves cached data untouched and retains the draft when an edited field is rejected', async () => {
    mocks.update.mockResolvedValue({ ok: false, error: 'Permission denied' })
    openTask()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Unsaved rename' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByText('Permission denied')
    expect(screen.getByLabelText('Name')).toHaveValue('Unsaved rename')
    expect(mocks.patch).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
