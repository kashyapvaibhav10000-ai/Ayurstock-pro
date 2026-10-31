"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { useUsernameAvailability, usernameBlocked } from "@/hooks/use-username-availability"
import UsernameStatusLine from "@/components/settings/username-status"
import { superAdminIdentifierWarning } from "@/lib/super-admin-warning"

// Interfaces mapping to Prisma models
interface User {
  id: string
  name: string
  email: string
  username?: string | null
  phone?: string | null
  hasPin?: boolean
  role: string
  isActive: boolean
  createdAt?: string
}

// Zod Validation Schemas
const userSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email format"),
  // Optional login name; rules checked live and by the API.
  username: z.string().optional(),
  // Optional: a disabled role select submits nothing (role unchanged).
  role: z.enum(["ADMIN", "MANAGER", "CASHIER"]).optional(),
  password: z.string().min(8, "Password must be strictly at least 8 characters").optional(),
  phone: z.string().max(20, "Phone is too long").optional(),
  // Blank = keep the current PIN.
  pin: z.string().regex(/^(\d{4})?$/, "PIN must be exactly 4 digits").optional(),
  removePin: z.boolean().optional(),
  isActive: z.boolean().optional(),
  // Own account only: needed to change your email or username.
  currentPassword: z.string().optional(),
})

const passwordSchema = z
  .object({
    newPassword: z.string().min(8, "Password must be strictly at least 8 characters"),
    // Own account only.
    currentPassword: z.string().optional(),
    confirmPassword: z.string().optional(),
  })
  .refine((data) => data.confirmPassword === undefined || data.confirmPassword === data.newPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

type UserFormData = z.infer<typeof userSchema>
type PasswordFormData = z.infer<typeof passwordSchema>

export default function UserSettings() {
  const [users, setUsers] = useState<User[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  // Identifiers that make you a super-admin via the server .env allowlist.
  const [superAdminVia, setSuperAdminVia] = useState<Array<"email" | "username">>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dialog states
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isPasswordOpen, setIsPasswordOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [passwordUser, setPasswordUser] = useState<User | null>(null)
  
  // React Hook Form for unified validation
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: { role: "MANAGER" }
  })

  // Hook Form specifically for Password Change
  const { register: registerPassword, handleSubmit: handlePasswordSubmit, reset: resetPassword, formState: { errors: passwordErrors, isSubmitting: isPasswordSubmitting } } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema)
  })

  // Live username check for whichever dialog is open (edit excludes the user's current name).
  const usernameStatus = useUsernameAvailability(
    watch("username") || "",
    isEditOpen ? editingUser?.username : null,
    isEditOpen ? editingUser?.id : undefined
  )

  // Initial Fetch
  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/users")
      const data = await res.json()
      
      if (!data.success) {
        if (data.message.includes('Forbidden') || data.message.includes('Unauthorized')) {
           setError("You do not have Admin permissions to view or manage users.")
           setUsers([])
        } else {
           setError(data.message || "Failed to load users")
        }
        return
      }
      
      setCurrentUserId(data.currentUserId)
      setSuperAdminVia(data.currentUserSuperAdminVia || [])
      setUsers(data.users)
      setError(null)
    } catch (err) {
      setError("Network error occurred while fetching users.")
      toast.error("Network connection issue.")
    } finally {
      setLoading(false)
    }
  }

  // The server enforces this too; here it only disables controls and explains why.
  const activeAdminCount = users.filter(u => u.role === "ADMIN" && u.isActive).length
  const isLastActiveAdmin = (user: User | null) =>
    Boolean(user && user.role === "ADMIN" && user.isActive && activeAdminCount <= 1)
  const LAST_ADMIN_TIP = "This is the shop's last active Admin. Make another user an active Admin first."

  const editingSelf = Boolean(editingUser && editingUser.id === currentUserId)
  const passwordSelf = Boolean(passwordUser && passwordUser.id === currentUserId)
  const editedEmail = (watch("email") || "").trim().toLowerCase()
  const editedUsername = (watch("username") || "").trim().toLowerCase()
  const selfEmailChanged = editingSelf && editedEmail !== editingUser?.email
  const selfUsernameChanged = editingSelf && editedUsername !== (editingUser?.username ?? "")
  const selfSuperAdminWarning = editingSelf
    ? superAdminIdentifierWarning(superAdminVia, { email: selfEmailChanged, username: selfUsernameChanged })
    : null

  const openAddModal = () => {
    reset({ name: "", email: "", username: "", password: "", role: "MANAGER" })
    setIsAddOpen(true)
  }

  const openEditModal = (user: User) => {
    setEditingUser(user)
    reset({
      name: user.name,
      email: user.email,
      username: user.username || "",
      role: user.role as any,
      phone: user.phone || "",
      pin: "",
      removePin: false,
      isActive: user.isActive,
      currentPassword: "",
    })
    setIsEditOpen(true)
  }

  const openPasswordModal = (user: User) => {
    setPasswordUser(user)
    resetPassword(user.id === currentUserId
      ? { newPassword: "", currentPassword: "", confirmPassword: "" }
      : { newPassword: "" })
    setIsPasswordOpen(true)
  }

  const handleAddSubmitForm = async (data: UserFormData) => {
    if (!data.password || data.password.length < 8) {
      toast.error("Password is legally required to be at least 8 characters for new users!")
      return
    }

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, username: data.username?.trim() || null }),
      })
      const result = await res.json()
      
      if (!result.success) {
        toast.error(result.message || "Failed to create user")
        return
      }

      toast.success("Employee safely registered!")
      setUsers(prev => [result.user, ...prev])
      setIsAddOpen(false)
      reset()
    } catch (err) {
      toast.error("Network error while creating user.")
    }
  }

  const handleEditSubmitForm = async (data: UserFormData) => {
    if (!editingUser) return
    const isSelf = editingUser.id === currentUserId

    if (isSelf && (selfEmailChanged || selfUsernameChanged) && !data.currentPassword) {
      toast.error("Enter your current password to change your email or username.")
      return
    }
    if (selfSuperAdminWarning && !confirm(`${selfSuperAdminWarning}\n\nSave anyway?`)) return
    if (isSelf && editingUser.isActive && data.isActive === false &&
        !confirm("Deactivate your own account? You will be signed out and need another Admin to reactivate you.")) return

    try {
      const username = data.username?.trim().toLowerCase() || null
      const payload: Record<string, unknown> = {
        name: data.name,
        email: data.email,
        username,
        role: data.role,
        phone: data.phone?.trim() || null,
      }
      // PIN: only sent when set or removed, so blank keeps the current one.
      if (data.removePin) payload.pin = null
      else if (data.pin) payload.pin = data.pin
      if (isSelf) {
        payload.isActive = data.isActive
        if (selfEmailChanged || selfUsernameChanged) payload.currentPassword = data.currentPassword
      }

      // Optimistic UI Update specifically for Edit
      setUsers(prev => prev.map(u => u.id === editingUser.id
        ? { ...u, name: data.name, email: data.email, username, role: data.role ?? u.role, phone: data.phone || null,
            hasPin: data.removePin ? false : data.pin ? true : u.hasPin, isActive: isSelf ? data.isActive ?? u.isActive : u.isActive }
        : u))
      setIsEditOpen(false)
      
      toast.info("Saving changes to profile...")

      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Notice we do NOT send the password here, enforcing backend rule
        body: JSON.stringify(payload),
      })
      
      const result = await res.json()
      if (!result.success) {
        toast.error(result.message || "Failed to update user. Reverting changes.")
        fetchUsers() // Revert optimistic update on failure
      } else {
        toast.success("Profile fully updated!")
        if (isSelf) fetchUsers() // own row may affect last-admin state and super-admin hints
      }
    } catch (err) {
      toast.error("Network error while updating user.")
      fetchUsers()
    }
  }

  const handlePasswordChange = async (data: PasswordFormData) => {
    if (!passwordUser) return

    try {
      const res = await fetch(`/api/users/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(passwordUser.id === currentUserId
          ? { userId: passwordUser.id, newPassword: data.newPassword, currentPassword: data.currentPassword, confirmPassword: data.confirmPassword ?? "" }
          : { userId: passwordUser.id, newPassword: data.newPassword }),
      })
      
      const result = await res.json()
      if (!result.success) {
        toast.error(result.message || "Failed to change password")
      } else {
        toast.success(`Password for ${passwordUser.email} has been overridden securely!`)
        setIsPasswordOpen(false)
      }
    } catch (err) {
      toast.error("Network error while updating password.")
    }
  }

  const handleDelete = async (user: User) => {
    if (!confirm(`Are you absolutely sure you want to deactivate ${user.name}? They will lose dashboard access immediately.`)) return

    try {
      // Optimistic UI Update for Soft Delete
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isActive: false } : u))

      const res = await fetch(`/api/users/${user.id}`, {
        method: "DELETE",
      })
      
      const result = await res.json()
      if (!result.success) {
        toast.error(result.message || "Failed to deactivate user")
        fetchUsers() // Revert
      } else {
        toast.success(`${user.name} safely deactivated. Sales records remain intact.`)
      }
    } catch (err) {
      toast.error("Network error while deleting user.")
      fetchUsers()
    }
  }

  const handleReactivate = async (user: User) => {
    try {
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isActive: true } : u))
      
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      })
      const result = await res.json()
      
      if (!result.success) {
        toast.error(result.message || "Failed to reactivate user")
        fetchUsers()
      } else {
        toast.success(`Reactivated ${user.name}'s account seamlessly.`)
      }
    } catch {
      toast.error("Network issue. Reverting Reactivation.")
      fetchUsers()
    }
  }

  if (loading) {
     return <Card><CardContent className="p-6 text-center text-muted-foreground">Loading user database securely...</CardContent></Card>
  }

  if (error) {
     return (
       <Card>
         <CardContent className="p-6 text-center">
            <h3 className="text-red-600 font-semibold mb-2">Access Denied</h3>
            <p className="text-muted-foreground text-sm">{error}</p>
         </CardContent>
       </Card>
     )
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="font-semibold text-lg text-foreground">User Management</h2>
            <p className="text-xs text-muted-foreground">Manage employee accounts, role escalations, and reset passwords.</p>
          </div>
          <Button onClick={openAddModal} className="bg-green-600 hover:bg-green-700 text-white">
            Add New User
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-border">
                <th className="p-3 text-muted-foreground font-medium">Name</th>
                <th className="p-3 text-muted-foreground font-medium">Email</th>
                <th className="p-3 text-muted-foreground font-medium">Username</th>
                <th className="p-3 text-muted-foreground font-medium">Role</th>
                <th className="p-3 text-muted-foreground font-medium">Status</th>
                <th className="p-3 text-muted-foreground font-medium text-right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-4 text-muted-foreground">No users found for this shop.</td></tr>
              ) : users.map((user) => {
                 // Check if the current row represents the currently logged-in admin!
                 const isSelf = user.id === currentUserId;
                 
                 return (
                <tr key={user.id} className={`border-b border-border hover:bg-surface-muted transition-colors ${!user.isActive ? 'opacity-60 grayscale' : ''}`}>
                  <td className="p-3 font-medium text-foreground">
                    {user.name} {isSelf && <span className="text-[9px] text-blue-600 font-bold ml-1">(YOU)</span>}
                  </td>
                  <td className="p-3 text-muted-foreground">{user.email}</td>
                  <td className="p-3 text-muted-foreground font-mono text-xs">{user.username || "—"}</td>
                  <td className="p-3">
                     <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                        user.role === 'ADMIN' ? 'bg-indigo-100 text-indigo-700' :
                        user.role === 'MANAGER' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-amber-100 text-amber-700'
                     }`}>
                       {user.role}
                     </span>
                  </td>
                  <td className="p-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        user.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}
                    >
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button onClick={() => openEditModal(user)} className="text-blue-600 hover:text-blue-800 hover:underline text-xs font-medium px-2 py-1 transition-all disabled:opacity-30 disabled:no-underline disabled:cursor-not-allowed">Edit</button>
                    <span className="text-muted-foreground">|</span>
                    <button onClick={() => openPasswordModal(user)} className="text-orange-500 hover:text-orange-700 hover:underline text-xs font-medium px-2 py-1 transition-all disabled:opacity-30 disabled:no-underline disabled:cursor-not-allowed">Reset Password</button>
                    <span className="text-muted-foreground">|</span>
                    {user.isActive ? (
                      // Wrapped so the tooltip shows even though the button is disabled.
                      <span title={isSelf ? "You can't delete your own account" : undefined}>
                        <button onClick={() => handleDelete(user)} disabled={isSelf} className="text-red-500 hover:text-red-700 hover:underline text-xs font-medium px-2 py-1 transition-all disabled:opacity-30 disabled:no-underline disabled:cursor-not-allowed">Delete</button>
                      </span>
                    ) : (
                      <button onClick={() => handleReactivate(user)} disabled={isSelf} className="text-green-600 hover:text-green-800 hover:underline text-xs font-medium px-2 py-1 transition-all disabled:opacity-30 disabled:no-underline disabled:cursor-not-allowed">Reactivate</button>
                    )}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>

        {/* ADD USER DIALOG */}
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogContent className="sm:max-w-[425px]">
            {isAddOpen && (
            <form onSubmit={handleSubmit(handleAddSubmitForm)}>
              <DialogHeader>
                <DialogTitle>Add New Employee</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input id="name" {...register("name")} placeholder="John Doe" />
                  {errors.name && <p className="text-[10px] text-red-500">{errors.name.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input id="email" type="email" {...register("email")} placeholder="john@shop.com" />
                  {errors.email && <p className="text-[10px] text-red-500">{errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">Username (optional)</Label>
                  <Input id="username" autoComplete="off" spellCheck={false} {...register("username")} placeholder="john.doe" />
                  <UsernameStatusLine status={usernameStatus} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Temporary Password</Label>
                  <Input id="password" type="password" {...register("password")} placeholder="•••••••• (Min 8)" />
                  {errors.password && <p className="text-[10px] text-red-500">{errors.password.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Account Role</Label>
                  <select {...register("role")} className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50">
                     <option value="CASHIER">Cashier (Limited Access)</option>
                     <option value="MANAGER">Manager (Can manage inventory)</option>
                     <option value="ADMIN">Admin (Full Access & Settings)</option>
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting || usernameBlocked(usernameStatus)} className="bg-green-600 hover:bg-green-700 text-white">
                  {isSubmitting ? "Creating..." : "Create Account"}
                </Button>
              </DialogFooter>
            </form>
            )}
          </DialogContent>
        </Dialog>

        {/* EDIT USER DIALOG */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="sm:max-w-[425px]">
            {isEditOpen && (
            <form onSubmit={handleSubmit(handleEditSubmitForm)}>
              <DialogHeader>
                <DialogTitle>Edit Employee Profiles</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Full Name</Label>
                  <Input id="edit-name" {...register("name")} />
                  {errors.name && <p className="text-[10px] text-red-500">{errors.name.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-email">Email Address</Label>
                  <Input id="edit-email" type="email" {...register("email")} />
                  {errors.email && <p className="text-[10px] text-red-500">{errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-username">Username</Label>
                  <Input id="edit-username" autoComplete="off" spellCheck={false} {...register("username")} placeholder="Not set" />
                  <UsernameStatusLine status={usernameStatus} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="edit-phone">Phone</Label>
                    <Input id="edit-phone" type="tel" {...register("phone")} placeholder="Not set" />
                    {errors.phone && <p className="text-[10px] text-red-500">{errors.phone.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-pin">POS PIN</Label>
                    <Input
                      id="edit-pin"
                      inputMode="numeric"
                      maxLength={4}
                      autoComplete="off"
                      disabled={watch("removePin")}
                      {...register("pin")}
                      placeholder={editingUser?.hasPin ? "•••• (keep)" : "4 digits"}
                    />
                    {errors.pin && <p className="text-[10px] text-red-500">{errors.pin.message}</p>}
                    {editingUser?.hasPin && (
                      <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <input type="checkbox" {...register("removePin")} />
                        Remove PIN
                      </label>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-role">Account Role</Label>
                  {/* Wrapped so the tooltip shows even though the select is disabled. */}
                  <div title={editingSelf && isLastActiveAdmin(editingUser) ? LAST_ADMIN_TIP : undefined}>
                    <select
                      id="edit-role"
                      {...register("role")}
                      disabled={editingUser?.role === 'ADMIN' && (!editingSelf || isLastActiveAdmin(editingUser))}
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:bg-surface-muted disabled:cursor-not-allowed"
                    >
                      <option value="CASHIER">Cashier</option>
                      <option value="MANAGER">Manager</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </div>
                  {editingUser?.role === 'ADMIN' && !editingSelf && <p className="text-[10px] text-muted-foreground">Another Admin manages their own account.</p>}
                  {editingSelf && isLastActiveAdmin(editingUser) && <p className="text-[10px] text-muted-foreground">{LAST_ADMIN_TIP}</p>}
                </div>
                {editingSelf && (
                  <div title={isLastActiveAdmin(editingUser) ? LAST_ADMIN_TIP : undefined}>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" {...register("isActive")} disabled={isLastActiveAdmin(editingUser)} />
                      Account active
                    </label>
                  </div>
                )}
                {editingSelf && (selfEmailChanged || selfUsernameChanged) && (
                  <div className="space-y-2">
                    <Label htmlFor="edit-current-password">Current Password</Label>
                    <Input id="edit-current-password" type="password" autoComplete="current-password" {...register("currentPassword")} placeholder="Required to change your email or username" />
                  </div>
                )}
                {selfSuperAdminWarning && <p className="text-[11px] text-amber-600">{selfSuperAdminWarning}</p>}
              </div>
              <DialogFooter>
                 <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                 <Button type="submit" disabled={isSubmitting || usernameBlocked(usernameStatus)} className="bg-blue-600 hover:bg-blue-700 text-white">
                   {isSubmitting ? "Saving..." : "Save Changes"}
                 </Button>
              </DialogFooter>
            </form>
            )}
          </DialogContent>
        </Dialog>

        {/* RESET PASSWORD DIALOG */}
        <Dialog open={isPasswordOpen} onOpenChange={setIsPasswordOpen}>
          <DialogContent className="sm:max-w-[425px]">
            {isPasswordOpen && (
            <form onSubmit={handlePasswordSubmit(handlePasswordChange)}>
              <DialogHeader>
                <DialogTitle>{passwordSelf ? "Change Your Password" : "Admin Password Override"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                {passwordSelf ? (
                  <>
                    <p className="text-xs text-muted-foreground">Change your own password.</p>
                    <div className="space-y-2">
                      <Label htmlFor="current-password">Current Password</Label>
                      <Input id="current-password" type="password" autoComplete="current-password" {...registerPassword("currentPassword")} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-password">New Password (Min 8 Characters)</Label>
                      <Input id="new-password" type="password" autoComplete="new-password" {...registerPassword("newPassword")} />
                      {passwordErrors.newPassword && <p className="text-[10px] text-red-500">{passwordErrors.newPassword.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirm-password">Confirm New Password</Label>
                      <Input id="confirm-password" type="password" autoComplete="new-password" {...registerPassword("confirmPassword")} />
                      {passwordErrors.confirmPassword && <p className="text-[10px] text-red-500">{passwordErrors.confirmPassword.message}</p>}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">You are securely overriding the password for <span className="font-bold text-foreground">{passwordUser?.email}</span>.</p>
                    <div className="space-y-2">
                      <Label htmlFor="new-password">New Password (Min 8 Characters)</Label>
                      <Input id="new-password" type="text" {...registerPassword("newPassword")} placeholder="Must be 8+ characters..." />
                      {passwordErrors.newPassword && <p className="text-[10px] text-red-500">{passwordErrors.newPassword.message}</p>}
                    </div>
                  </>
                )}
              </div>
              <DialogFooter>
                 <Button type="button" variant="outline" onClick={() => setIsPasswordOpen(false)}>Abort</Button>
                 <Button type="submit" disabled={isPasswordSubmitting} className="bg-orange-600 hover:bg-orange-700 text-white">
                   {isPasswordSubmitting ? "Overriding..." : "Confirm Override"}
                 </Button>
              </DialogFooter>
            </form>
            )}
          </DialogContent>
        </Dialog>

      </CardContent>
    </Card>
  )
}
