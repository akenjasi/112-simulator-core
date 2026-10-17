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
        <Badge className="bg-purple-100 text-purple-800 border-purple-300 font-semibold gap-1">
          <Shield className="w-3 h-3" />
          <span>ADMIN</span>
        </Badge>
      )
    }
    if (normalized === "TEACHER") {
      return (
        <Badge className="bg-blue-100 text-blue-800 border-blue-300 font-semibold gap-1">
          <Briefcase className="w-3 h-3" />
          <span>TEACHER</span>
        </Badge>
      )
    }
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold gap-1">
        <GraduationCap className="w-3 h-3" />
        <span>CADET</span>
      </Badge>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Управление пользователями
            </h1>
            <Badge variant="outline" className="text-slate-600 font-bold ml-1">
              Всего: {users.length}
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Просмотр курсантов, преподавателей и администраторов, назначение ролей и блокировка
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={loadUsersList}
            disabled={isLoading}
            className="flex items-center gap-2 cursor-pointer bg-white"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            <span>Обновить</span>
          </Button>

          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-purple-700 hover:bg-purple-800 text-white flex items-center gap-2 cursor-pointer shadow-sm"
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
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            {/* Search */}
            <div className="relative w-full sm:flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <Input
                placeholder="Поиск по ФИО, логину или номеру билета..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-slate-50"
              />
            </div>

            {/* Role Filter */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Роль:</span>
              <select
                aria-label="Фильтр по роли"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-slate-50 px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600"
              >
                <option value="ALL">Все роли</option>
                <option value="CADET">Курсанты (CADET)</option>
                <option value="TEACHER">Преподаватели (TEACHER)</option>
                <option value="ADMIN">Администраторы (ADMIN)</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Статус:</span>
              <select
                aria-label="Фильтр по статусу"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-slate-50 px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600"
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
      <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto w-full">
          <Table className="min-w-[650px]">
            <TableHeader>
              <TableRow className="bg-slate-50 border-b border-slate-200">
                <TableHead className="font-bold text-slate-700">ФИО / Имя</TableHead>
                <TableHead className="font-bold text-slate-700">Логин (Email)</TableHead>
                <TableHead className="font-bold text-slate-700">Роль</TableHead>
                <TableHead className="font-bold text-slate-700">Группа / Номер</TableHead>
                <TableHead className="font-bold text-slate-700">Статус</TableHead>
                <TableHead className="font-bold text-slate-700 text-right pr-6">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-slate-500">
                    Пользователи не найдены
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => {
                  const isActive = user.is_active !== false
                  return (
                    <TableRow
                      key={user.user_id}
                      className={!isActive ? "bg-red-50/40 opacity-80" : "hover:bg-slate-50/80"}
                    >
                      {/* Name */}
                      <TableCell className="font-medium text-slate-900">
                        {user.full_name || "—"}
                      </TableCell>

                      {/* Username */}
                      <TableCell className="text-slate-600 font-mono text-xs">
                        {user.username}
                      </TableCell>

                      {/* Role */}
                      <TableCell>{renderRoleBadge(user.role)}</TableCell>

                      {/* Student ID */}
                      <TableCell className="text-slate-600 text-xs">
                        {user.student_id || "—"}
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        {isActive ? (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold gap-1">
                            <UserCheck className="w-3 h-3" />
                            <span>Активен</span>
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800 border-red-300 font-semibold gap-1">
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
                            className="h-8 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 hover:border-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-600"
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
                            className="h-8 px-2 text-xs text-amber-700 border-amber-300 hover:bg-amber-50 cursor-pointer"
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
                                ? "text-red-700 border-red-300 hover:bg-red-50"
                                : "text-emerald-700 border-emerald-300 hover:bg-emerald-50"
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
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
                  <UserPlus className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Новый пользователь</h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Логин / Username <span className="text-red-500">*</span>
                </label>
                <Input
                  required
                  placeholder="ivanov@system112.ru"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Пароль <span className="text-red-500">*</span>
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
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Роль в системе
                </label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full h-9 rounded-md border border-input bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600"
                >
                  <option value="CADET">Курсант (CADET)</option>
                  <option value="TEACHER">Преподаватель (TEACHER)</option>
                  <option value="ADMIN">Администратор (ADMIN)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  ФИО
                </label>
                <Input
                  placeholder="Иванов Иван Иванович"
                  value={newUser.full_name || ""}
                  onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Номер студенческого билета / группы
                </label>
                <Input
                  placeholder="СМ1-12"
                  value={newUser.student_id || ""}
                  onChange={(e) => setNewUser({ ...newUser, student_id: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
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
                  className="bg-purple-700 hover:bg-purple-800 text-white"
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
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Изменить пароль</h3>
                  <p className="text-xs text-slate-500">{passwordDialog.username}</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Закрыть окно смены пароля"
                onClick={() => setPasswordDialog(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
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
                  className={passwordMode === "generated" ? "bg-purple-700 text-white" : ""}
                >
                  Сгенерировать
                </Button>
                <Button
                  type="button"
                  variant={passwordMode === "custom" ? "default" : "outline"}
                  onClick={() => setPasswordMode("custom")}
                  className={passwordMode === "custom" ? "bg-purple-700 text-white" : ""}
                >
                  Задать свой
                </Button>
              </div>

              {passwordMode === "custom" && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
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
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
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

              <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={revokeSessions}
                  onChange={(e) => setRevokeSessions(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-purple-700"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">
                    Завершить активные сессии
                  </span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    Включайте, если есть риск, что доступ к аккаунту получил посторонний.
                  </span>
                </span>
              </label>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
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
                  className="bg-purple-700 hover:bg-purple-800 text-white"
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
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden p-6 text-center space-y-4">
            <div className="w-12 h-12 mx-auto bg-amber-100 text-amber-700 rounded-full flex items-center justify-center">
              <KeyRound className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900">Пароль успешно изменён</h3>
            <p className="text-xs text-slate-600">
              Для пользователя <span className="font-bold text-slate-800">{resetResult.username}</span>{" "}
              {resetResult.wasGenerated ? "сгенерирован" : "установлен"} новый пароль:
            </p>

            <div className="p-3 bg-slate-100 border border-slate-300 rounded-xl font-mono text-xl font-black text-purple-700 select-all tracking-wider">
              {resetResult.newPassword}
            </div>

            <p className="text-xs text-slate-400">
              {resetResult.sessionsRevoked
                ? "Все прежние сессии пользователя завершены."
                : "Активные сессии пользователя сохранены."}
            </p>

            <Button
              onClick={() => setResetResult(null)}
              className="w-full bg-purple-700 hover:bg-purple-800 text-white font-semibold cursor-pointer"
            >
              Закрыть
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
