"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import {
  Users,
  Search,
  UserPlus,
  RefreshCw,
  KeyRound,
  Shield,
  GraduationCap,
  Briefcase,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  X,
  UserCheck,
  UserX,
} from "lucide-react"
import {
  fetchUsers,
  createUser,
  updateUser,
  deleteUser,
  resetUserPassword,
  AdminUser,
  CreateUserData,
} from "@/lib/admin-api"

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState<string>("ALL")
  const [statusFilter, setStatusFilter] = useState<string>("ALL")

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newUser, setNewUser] = useState<CreateUserData>({
    username: "",
    password: "",
    role: "CADET",
    full_name: "",
    student_id: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [passwordDialog, setPasswordDialog] = useState<{
    userId: string
    username: string
  } | null>(null)
  const [passwordMode, setPasswordMode] = useState<"generated" | "custom">("generated")
  const [customPassword, setCustomPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [revokeSessions, setRevokeSessions] = useState(false)
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false)

  // Password reset result modal
  const [resetResult, setResetResult] = useState<{
    username: string
    newPassword: string
    wasGenerated: boolean
    sessionsRevoked: boolean
  } | null>(null)

  // Notification banners
  const [notification, setNotification] = useState<{
    type: "success" | "error"
    message: string
  } | null>(null)

  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message })
    setTimeout(() => {
      setNotification(null)
    }, 6000)
  }

  const loadUsersList = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await fetchUsers()
      setUsers(data)
    } catch (err: any) {
      showNotification("error", err.message || "Не удалось загрузить список пользователей")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsersList()
  }, [loadUsersList])

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const query = searchQuery.toLowerCase().trim()
      const matchQuery =
        !query ||
        u.username.toLowerCase().includes(query) ||
        (u.full_name && u.full_name.toLowerCase().includes(query)) ||
        (u.student_id && u.student_id.toLowerCase().includes(query))

      const matchRole =
        roleFilter === "ALL" || u.role?.toUpperCase() === roleFilter.toUpperCase()

      const matchStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && u.is_active !== false) ||
        (statusFilter === "BLOCKED" && u.is_active === false)

      return matchQuery && matchRole && matchStatus
    })
  }, [users, searchQuery, roleFilter, statusFilter])

  // Change user role
  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await updateUser(userId, { role: newRole })
      setUsers((prev) =>
        prev.map((u) => (u.user_id === userId ? { ...u, role: newRole } : u))
      )
      showNotification("success", `Роль пользователя успешно изменена на ${newRole}`)
    } catch (err: any) {
      showNotification("error", err.message || "Ошибка изменения роли")
    }
  }

  // Toggle user block / unblock
  const handleToggleBlock = async (user: AdminUser) => {
    try {
      const willBlock = user.is_active !== false
      if (willBlock) {
        await deleteUser(user.user_id)
        setUsers((prev) =>
          prev.map((u) =>
            u.user_id === user.user_id ? { ...u, is_active: false } : u
          )
        )
        showNotification("success", `Пользователь ${user.username} заблокирован`)
      } else {
        await updateUser(user.user_id, { is_active: true })
        setUsers((prev) =>
          prev.map((u) =>
            u.user_id === user.user_id ? { ...u, is_active: true } : u
          )
        )
        showNotification("success", `Пользователь ${user.username} разблокирован`)
      }
    } catch (err: any) {
      showNotification("error", err.message || "Ошибка обновления статуса пользователя")
    }
  }

  // Reset user password
  const openPasswordDialog = (userId: string, username: string) => {
    setPasswordDialog({ userId, username })
    setPasswordMode("generated")
    setCustomPassword("")
    setConfirmPassword("")
    setRevokeSessions(false)
  }

  const handleResetPassword = async () => {
    if (!passwordDialog) return
    if (passwordMode === "custom") {
      if (!customPassword) {
        showNotification("error", "Введите новый пароль")
        return
      }
      if (customPassword !== confirmPassword) {
        showNotification("error", "Пароли не совпадают")
        return
      }
    }

    setIsPasswordSubmitting(true)
    try {
      const res = await resetUserPassword(passwordDialog.userId, {
        password: passwordMode === "custom" ? customPassword : undefined,
        revokeSessions,
      })
      setResetResult({
        username: res.username || passwordDialog.username,
        newPassword: res.new_password,
        wasGenerated: res.password_was_generated,
        sessionsRevoked: res.sessions_revoked,
      })
      setPasswordDialog(null)
    } catch (err: any) {
      showNotification("error", err.message || "Ошибка сброса пароля")
    } finally {
      setIsPasswordSubmitting(false)
    }
  }

  // Create new user submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUser.username || !newUser.password) {
      showNotification("error", "Заполните логин и пароль")
      return
    }
    setIsSubmitting(true)
    try {
      const created = await createUser(newUser)
      setUsers((prev) => [created, ...prev])
      setIsCreateModalOpen(false)
      setNewUser({
        username: "",
        password: "",
        role: "CADET",
        full_name: "",
        student_id: "",
      })
      showNotification("success", `Пользователь ${created.username} успешно создан`)
    } catch (err: any) {
      showNotification("error", err.message || "Ошибка при создании пользователя")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Helper for role badge
  const renderRoleBadge = (role: string) => {
    const normalized = role?.toUpperCase()
    if (normalized === "ADMIN") {
      return (
        <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30 font-semibold gap-1">
          <Shield className="w-3 h-3" />
          <span>ADMIN</span>
        </Badge>
      )
    }
    if (normalized === "TEACHER") {
      return (
        <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30 font-semibold gap-1">
          <Briefcase className="w-3 h-3" />
          <span>TEACHER</span>
        </Badge>
      )
    }
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-semibold gap-1">
        <GraduationCap className="w-3 h-3" />
        <span>CADET</span>
      </Badge>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
              Управление пользователями
            </h1>
            <Badge variant="outline" className="text-muted-foreground border-border font-bold ml-1">
              Всего: {users.length}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Просмотр курсантов, преподавателей и администраторов, назначение ролей и блокировка
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={loadUsersList}
            disabled={isLoading}
            className="flex items-center gap-2 cursor-pointer bg-card hover:bg-accent border-border"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            <span>Обновить</span>
          </Button>

          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            <span>Добавить пользователя</span>
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div
          className={`border rounded-xl p-4 flex items-center gap-3 animate-in fade-in ${
            notification.type === "success"
              ? "bg-emerald-50 border-emerald-300 text-emerald-800"
              : "bg-red-50 border-red-300 text-red-800"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          )}
          <div className="text-sm font-medium">{notification.message}</div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <Card className="bg-card border-border shadow-sm">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            {/* Search */}
            <div className="relative w-full sm:flex-1">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
              <Input
                placeholder="Поиск по ФИО, логину или номеру билета..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-background border-input"
              />
            </div>

            {/* Role Filter */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Роль:</span>
              <select
                aria-label="Фильтр по роли"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="ALL">Все роли</option>
                <option value="CADET">Курсанты (CADET)</option>
                <option value="TEACHER">Преподаватели (TEACHER)</option>
                <option value="ADMIN">Администраторы (ADMIN)</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Статус:</span>
              <select
                aria-label="Фильтр по статусу"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="ALL">Все статусы</option>
                <option value="ACTIVE">Активные</option>
                <option value="BLOCKED">Заблокированные</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="bg-card border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto w-full">
          <Table className="min-w-[650px]">
            <TableHeader>
              <TableRow className="bg-muted/40 border-b border-border">
                <TableHead className="font-bold text-foreground">ФИО / Имя</TableHead>
                <TableHead className="font-bold text-foreground">Логин (Email)</TableHead>
                <TableHead className="font-bold text-foreground">Роль</TableHead>
                <TableHead className="font-bold text-foreground">Группа / Номер</TableHead>
                <TableHead className="font-bold text-foreground">Статус</TableHead>
                <TableHead className="font-bold text-foreground text-right pr-6">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    Пользователи не найдены
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => {
                  const isActive = user.is_active !== false
                  return (
                    <TableRow
                      key={user.user_id}
                      className={!isActive ? "bg-destructive/10 opacity-80" : "hover:bg-muted/40"}
                    >
                      {/* Name */}
                      <TableCell className="font-medium text-foreground">
                        {user.full_name || "—"}
                      </TableCell>

                      {/* Username */}
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {user.username}
                      </TableCell>

                      {/* Role */}
                      <TableCell>{renderRoleBadge(user.role)}</TableCell>

                      {/* Student ID */}
                      <TableCell className="text-muted-foreground text-xs">
                        {user.student_id || "—"}
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        {isActive ? (
                          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-semibold gap-1">
                            <UserCheck className="w-3 h-3" />
                            <span>Активен</span>
                          </Badge>
                        ) : (
                          <Badge className="bg-destructive/15 text-destructive border-destructive/30 font-semibold gap-1">
                            <UserX className="w-3 h-3" />
                            <span>Заблокирован</span>
                          </Badge>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right pr-6">
                        <div className="flex items-center justify-end gap-2">
                          {/* Role switch dropdown */}
                          <select
                            aria-label={`Изменить роль ${user.username}`}
                            value={user.role}
                            onChange={(e) => handleRoleChange(user.user_id, e.target.value)}
                            className="h-8 rounded border border-input bg-background text-foreground px-2 py-0.5 text-xs font-semibold hover:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            <option value="CADET">CADET</option>
                            <option value="TEACHER">TEACHER</option>
                            <option value="ADMIN">ADMIN</option>
                          </select>

                          {/* Reset Password */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openPasswordDialog(user.user_id, user.username)}
                            title="Изменить пароль"
                            className="h-8 px-2 text-xs text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10 cursor-pointer"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </Button>

                          {/* Block / Unblock */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleBlock(user)}
                            title={isActive ? "Заблокировать пользователя" : "Разблокировать пользователя"}
                            className={`h-8 px-2 text-xs cursor-pointer ${
                              isActive
                                ? "text-destructive border-destructive/30 hover:bg-destructive/10"
                                : "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                            }`}
                          >
                            {isActive ? (
                              <Lock className="w-3.5 h-3.5" />
                            ) : (
                              <Unlock className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Modal: Create User */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in">
          <div className="bg-card rounded-2xl shadow-2xl border border-border max-w-lg w-full overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-primary/10 text-primary rounded-lg">
                  <UserPlus className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground">Новый пользователь</h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  Логин / Username <span className="text-destructive">*</span>
                </label>
                <Input
                  required
                  placeholder="ivanov@system112.ru"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  Пароль <span className="text-destructive">*</span>
                </label>
                <Input
                  required
                  type="password"
                  placeholder="Введите пароль..."
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  Роль в системе
                </label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full h-9 rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="CADET">Курсант (CADET)</option>
                  <option value="TEACHER">Преподаватель (TEACHER)</option>
                  <option value="ADMIN">Администратор (ADMIN)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  ФИО
                </label>
                <Input
                  placeholder="Иванов Иван Иванович"
                  value={newUser.full_name || ""}
                  onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  Номер студенческого билета / группы
                </label>
                <Input
                  placeholder="СМ1-12"
                  value={newUser.student_id || ""}
                  onChange={(e) => setNewUser({ ...newUser, student_id: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Отмена
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {isSubmitting ? "Создание..." : "Создать"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Password Change */}
      {passwordDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in">
          <div className="bg-card rounded-2xl shadow-2xl border border-border max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Изменить пароль</h3>
                  <p className="text-xs text-muted-foreground">{passwordDialog.username}</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Закрыть окно смены пароля"
                onClick={() => setPasswordDialog(null)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Способ смены пароля">
                <Button
                  type="button"
                  variant={passwordMode === "generated" ? "default" : "outline"}
                  onClick={() => setPasswordMode("generated")}
                  className={passwordMode === "generated" ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}
                >
                  Сгенерировать
                </Button>
                <Button
                  type="button"
                  variant={passwordMode === "custom" ? "default" : "outline"}
                  onClick={() => setPasswordMode("custom")}
                  className={passwordMode === "custom" ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}
                >
                  Задать свой
                </Button>
              </div>

              {passwordMode === "custom" && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-foreground block mb-1">
                      Новый пароль
                    </label>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={customPassword}
                      onChange={(e) => setCustomPassword(e.target.value)}
                      placeholder="Не короче политики безопасности"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground block mb-1">
                      Повторите пароль
                    </label>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Введите пароль ещё раз"
                    />
                  </div>
                </div>
              )}

              <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={revokeSessions}
                  onChange={(e) => setRevokeSessions(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                />
                <span>
                  <span className="block text-sm font-semibold text-foreground">
                    Завершить активные сессии
                  </span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    Включайте, если есть риск, что доступ к аккаунту получил посторонний.
                  </span>
                </span>
              </label>

              <div className="flex justify-end gap-3 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPasswordDialog(null)}
                  disabled={isPasswordSubmitting}
                >
                  Отмена
                </Button>
                <Button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={isPasswordSubmitting}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {isPasswordSubmitting ? "Сохранение..." : "Изменить пароль"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Password Reset Display */}
      {resetResult && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in">
          <div className="bg-card rounded-2xl shadow-2xl border border-border max-w-md w-full overflow-hidden p-6 text-center space-y-4">
            <div className="w-12 h-12 mx-auto bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center">
              <KeyRound className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-foreground">Пароль успешно изменён</h3>
            <p className="text-xs text-muted-foreground">
              Для пользователя <span className="font-bold text-foreground">{resetResult.username}</span>{" "}
              {resetResult.wasGenerated ? "сгенерирован" : "установлен"} новый пароль:
            </p>

            <div className="p-3 bg-muted/50 border border-border rounded-xl font-mono text-xl font-black text-primary select-all tracking-wider">
              {resetResult.newPassword}
            </div>

            <p className="text-xs text-muted-foreground">
              {resetResult.sessionsRevoked
                ? "Все прежние сессии пользователя завершены."
                : "Активные сессии пользователя сохранены."}
            </p>

            <Button
              onClick={() => setResetResult(null)}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold cursor-pointer"
            >
              Закрыть
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
