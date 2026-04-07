/**
 * UserManagementPage — list, create, edit, deactivate users (Admin only).
 */

import { useCallback, useEffect, useState } from 'react'
import { Shield, UserCheck, UserX } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { db } from '@/db'
import { hashPassword, generateId } from '@/crypto'
import { writeAuditLog } from '@/utils/audit'
import { requirePermission } from '@/utils/permissions'
import { Badge, Button, Card, Input, Modal, Select, Spinner, Table } from '@/components/ui'
import type { ColumnDef } from '@/components/ui'
import { Role } from '@/types'
import type { User } from '@/types'

/**
 * DTO — strips sensitive credential fields from the full User record so that
 * password hashes never live in React state.
 */
interface UserDTO {
  id: string
  username: string
  displayName: string
  email: string
  role: Role
  organization?: string
  isActive: boolean
  isTemporaryPassword: boolean
  createdAt: number
  createdBy: string
}

function toDTO(u: User): UserDTO {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    email: u.email,
    role: u.role,
    organization: u.organization,
    isActive: u.isActive,
    isTemporaryPassword: u.isTemporaryPassword,
    createdAt: u.createdAt,
    createdBy: u.createdBy,
  }
}

const ROLE_VARIANTS: Record<
  Role,
  'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
> = {
  [Role.Administrator]: 'danger',
  [Role.ContentEditor]: 'primary',
  [Role.ReviewerApprover]: 'warning',
  [Role.Participant]: 'default',
}

const ROLES = Object.values(Role)

interface UserFormState {
  displayName: string
  username: string
  email: string
  role: Role
  organization: string
  password: string
  confirmPassword: string
}

const emptyForm = (): UserFormState => ({
  displayName: '',
  username: '',
  email: '',
  role: Role.Participant,
  organization: '',
  password: '',
  confirmPassword: '',
})

export function UserManagementPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  // UserDTO strips passwordHash/passwordSalt — credential fields never held in React state
  const [users, setUsers] = useState<UserDTO[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isActing, setIsActing] = useState(false)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingUser, setEditingUser] = useState<UserDTO | null>(null)
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetTarget, setResetTarget] = useState<UserDTO | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [form, setForm] = useState(emptyForm())
  const [errors, setErrors] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const all = await db.users.orderBy('createdAt').toArray()
      // Map to DTOs — password hashes are never held in component state
      setUsers(all.map(toDTO))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (!currentUser) return null

  const validate = (isEdit: boolean): boolean => {
    const e: Record<string, string> = {}
    if (!form.displayName.trim()) e.displayName = 'Display name is required'
    if (!isEdit) {
      if (!form.username.trim()) e.username = 'Username is required'
      if (form.password.length < 12) e.password = 'Password must be at least 12 characters'
      if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleCreate = async () => {
    if (!validate(false)) return
    requirePermission('manageUsers')
    setIsActing(true)
    try {
      const existing = await db.users
        .where('username')
        .equals(form.username.toLowerCase().trim())
        .first()
      if (existing) {
        setErrors({ username: 'Username already taken' })
        return
      }
      const { hash, salt } = await hashPassword(form.password)
      const now = Date.now()
      const user: User = {
        id: generateId(),
        username: form.username.toLowerCase().trim(),
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        passwordHash: hash,
        passwordSalt: salt,
        role: form.role,
        organization: form.organization.trim() || undefined,
        isActive: true,
        isTemporaryPassword: true,
        createdAt: now,
        updatedAt: now,
        createdBy: currentUser.id,
      }
      await db.users.add(user)
      await writeAuditLog({
        eventType: 'user.created',
        actorId: currentUser.id,
        actorName: currentUser.displayName,
        entityType: 'User',
        entityId: user.id,
        description: `${currentUser.displayName} created user "${user.displayName}" (${user.role})`,
      })
      toast.success('User created')
      setShowCreateModal(false)
      setForm(emptyForm())
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setIsActing(false)
    }
  }

  const handleUpdate = async () => {
    if (!editingUser || !validate(true)) return
    requirePermission('manageUsers')
    setIsActing(true)
    try {
      await db.users.update(editingUser.id, {
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        role: form.role,
        organization: form.organization.trim() || undefined,
        updatedAt: Date.now(),
      })
      await writeAuditLog({
        eventType: 'user.updated',
        actorId: currentUser.id,
        actorName: currentUser.displayName,
        entityType: 'User',
        entityId: editingUser.id,
        description: `${currentUser.displayName} updated user "${form.displayName}" — role: ${form.role}`,
      })
      toast.success('User updated')
      setEditingUser(null)
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update user')
    } finally {
      setIsActing(false)
    }
  }

  const handleToggleActive = async (user: UserDTO) => {
    requirePermission('manageUsers')
    setIsActing(true)
    try {
      const newActive = !user.isActive
      await db.users.update(user.id, { isActive: newActive, updatedAt: Date.now() })
      await writeAuditLog({
        eventType: newActive ? 'user.activated' : 'user.deactivated',
        actorId: currentUser.id,
        actorName: currentUser.displayName,
        entityType: 'User',
        entityId: user.id,
        description: `${currentUser.displayName} ${newActive ? 'activated' : 'deactivated'} user "${user.displayName}"`,
      })
      toast.success(newActive ? 'User activated' : 'User deactivated')
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setIsActing(false)
    }
  }

  const handleResetPassword = async () => {
    if (!resetTarget || newPassword.length < 12) {
      setErrors({ newPassword: 'Password must be at least 12 characters' })
      return
    }
    requirePermission('manageUsers')
    setIsActing(true)
    try {
      const { hash, salt } = await hashPassword(newPassword)
      await db.users.update(resetTarget.id, {
        passwordHash: hash,
        passwordSalt: salt,
        isTemporaryPassword: true,
        updatedAt: Date.now(),
      })
      await writeAuditLog({
        eventType: 'user.password_reset',
        actorId: currentUser.id,
        actorName: currentUser.displayName,
        entityType: 'User',
        entityId: resetTarget.id,
        description: `${currentUser.displayName} reset password for "${resetTarget.displayName}"`,
      })
      toast.success('Password reset — user must change on next login')
      setShowResetModal(false)
      setResetTarget(null)
      setNewPassword('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset password')
    } finally {
      setIsActing(false)
    }
  }

  const openEdit = (user: UserDTO) => {
    setEditingUser(user)
    setForm({
      ...emptyForm(),
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      organization: user.organization ?? '',
    })
    setErrors({})
  }

  const columns: ColumnDef<UserDTO>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (u) => (
        <div>
          <p className="text-sm font-medium text-surface-100">{u.displayName}</p>
          <p className="text-xs text-surface-500 font-mono">{u.username}</p>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      width: 'w-48',
      cell: (u) => <span className="text-xs text-surface-400">{u.email || '—'}</span>,
    },
    {
      key: 'role',
      header: 'Role',
      width: 'w-40',
      cell: (u) => <Badge variant={ROLE_VARIANTS[u.role]}>{u.role}</Badge>,
    },
    {
      key: 'org',
      header: 'Org',
      width: 'w-32',
      cell: (u) => <span className="text-xs text-surface-400">{u.organization || '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-24',
      cell: (u) => (
        <Badge variant={u.isActive ? 'success' : 'default'}>
          {u.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'temp',
      header: '',
      width: 'w-28',
      cell: (u) =>
        u.isTemporaryPassword ? (
          <span className="text-xs text-amber-400 flex items-center gap-1">
            <Shield className="w-3 h-3" />
            Temp pw
          </span>
        ) : null,
    },
    {
      key: 'actions',
      header: '',
      width: 'w-36',
      cell: (u) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              openEdit(u)
            }}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setResetTarget(u)
              setNewPassword('')
              setErrors({})
              setShowResetModal(true)
            }}
          >
            Reset pw
          </Button>
          {u.id !== currentUser.id && (
            <button
              onClick={() => void handleToggleActive(u)}
              title={u.isActive ? 'Deactivate' : 'Activate'}
              className={`p-1.5 rounded transition-colors ${u.isActive ? 'text-surface-500 hover:text-red-400 hover:bg-surface-700' : 'text-surface-500 hover:text-emerald-400 hover:bg-surface-700'}`}
            >
              {u.isActive ? (
                <UserX className="w-3.5 h-3.5" />
              ) : (
                <UserCheck className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-surface-100">User Management</h1>
          <p className="text-sm text-surface-500 mt-0.5">
            {users.length} user{users.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setForm(emptyForm())
            setErrors({})
            setShowCreateModal(true)
          }}
        >
          + New User
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Spinner size="lg" />
        </div>
      ) : (
        <Card padded={false}>
          <Table columns={columns} data={users} rowKey={(u) => u.id} isLoading={isLoading} />
        </Card>
      )}

      {/* Create modal */}
      <Modal
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
        }}
        title="New User"
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Display Name"
            value={form.displayName}
            onChange={(e) => {
              setForm((f) => ({ ...f, displayName: e.target.value }))
            }}
            error={errors.displayName}
          />
          <Input
            label="Username"
            value={form.username}
            onChange={(e) => {
              setForm((f) => ({ ...f, username: e.target.value }))
            }}
            error={errors.username}
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => {
              setForm((f) => ({ ...f, email: e.target.value }))
            }}
          />
          <Select
            label="Role"
            value={form.role}
            onChange={(e) => {
              setForm((f) => ({ ...f, role: e.target.value as Role }))
            }}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
          <Input
            label="Organisation"
            value={form.organization}
            onChange={(e) => {
              setForm((f) => ({ ...f, organization: e.target.value }))
            }}
            placeholder="e.g. Finance, Engineering, HR"
            hint="Used for publication targeting. Leave blank if not applicable."
          />
          <Input
            label="Password"
            type="password"
            value={form.password}
            onChange={(e) => {
              setForm((f) => ({ ...f, password: e.target.value }))
            }}
            error={errors.password}
            hint="Min 12 characters. User will be required to change on first login."
          />
          <Input
            label="Confirm Password"
            type="password"
            value={form.confirmPassword}
            onChange={(e) => {
              setForm((f) => ({ ...f, confirmPassword: e.target.value }))
            }}
            error={errors.confirmPassword}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreateModal(false)
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void handleCreate()} isLoading={isActing}>
              Create User
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit modal */}
      <Modal
        open={!!editingUser}
        onClose={() => {
          setEditingUser(null)
        }}
        title={`Edit: ${editingUser?.displayName ?? ''}`}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Display Name"
            value={form.displayName}
            onChange={(e) => {
              setForm((f) => ({ ...f, displayName: e.target.value }))
            }}
            error={errors.displayName}
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => {
              setForm((f) => ({ ...f, email: e.target.value }))
            }}
          />
          <Select
            label="Role"
            value={form.role}
            onChange={(e) => {
              setForm((f) => ({ ...f, role: e.target.value as Role }))
            }}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
          <Input
            label="Organisation"
            value={form.organization}
            onChange={(e) => {
              setForm((f) => ({ ...f, organization: e.target.value }))
            }}
            placeholder="e.g. Finance, Engineering, HR"
            hint="Used for publication targeting. Leave blank if not applicable."
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setEditingUser(null)
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void handleUpdate()} isLoading={isActing}>
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Password reset modal */}
      <Modal
        open={showResetModal}
        onClose={() => {
          setShowResetModal(false)
        }}
        title={`Reset Password: ${resetTarget?.displayName ?? ''}`}
      >
        <div className="space-y-4">
          <Input
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value)
              setErrors({})
            }}
            error={errors.newPassword}
            hint="Min 12 characters. User will be required to change on next login."
          />
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setShowResetModal(false)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => void handleResetPassword()}
              isLoading={isActing}
              disabled={newPassword.length < 12}
            >
              Reset Password
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
