"use client"

import { useAuth, useDisplayName } from "@/lib/providers"
import { signOut } from "@/lib/actions/auth"
import { getNotifications } from "@/lib/actions/notifications"
import type { NotificationItem } from "@/lib/actions/notifications"
import { Sun, Moon, Bell, CheckCircle, XCircle, Clock, AlertCircle, UserPlus, ArrowRight, CalendarDays, FileText, Shield, BellRing, BarChart2, Server, LogOut, ShieldAlert, ClipboardList, GitBranch, FileSpreadsheet, Building2 } from "lucide-react"
import { useTheme } from "next-themes"
import { useState, useEffect, useTransition } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import Link from "next/link"

const NOTIF_CONFIG: Record<NotificationItem["kind"], { icon: React.ElementType; iconClass: string; bgClass: string }> = {
  leave_approved:          { icon: CheckCircle, iconClass: "text-emerald-400", bgClass: "bg-emerald-500/10 border-emerald-500/20" },
  leave_rejected:          { icon: XCircle,     iconClass: "text-rose-400",    bgClass: "bg-rose-500/10 border-rose-500/20"      },
  leave_pending:           { icon: Clock,       iconClass: "text-amber-400",   bgClass: "bg-amber-500/10 border-amber-500/20"    },
  team_leave_pending:      { icon: AlertCircle, iconClass: "text-amber-400",   bgClass: "bg-amber-500/10 border-amber-500/20"    },
  visitor_checkin:         { icon: UserPlus,    iconClass: "text-violet-400",  bgClass: "bg-violet-500/10 border-violet-500/20"  },
  expense_approved:        { icon: CheckCircle, iconClass: "text-emerald-400", bgClass: "bg-emerald-500/10 border-emerald-500/20" },
  expense_rejected:        { icon: XCircle,     iconClass: "text-rose-400",    bgClass: "bg-rose-500/10 border-rose-500/20"      },
  expense_pending:         { icon: Clock,       iconClass: "text-amber-400",   bgClass: "bg-amber-500/10 border-amber-500/20"    },
  expense_pending_approval:{ icon: AlertCircle,    iconClass: "text-blue-400",    bgClass: "bg-blue-500/10 border-blue-500/20"     },
  pr_approved:             { icon: CheckCircle,   iconClass: "text-emerald-400", bgClass: "bg-emerald-500/10 border-emerald-500/20" },
  pr_rejected:             { icon: XCircle,       iconClass: "text-rose-400",    bgClass: "bg-rose-500/10 border-rose-500/20"      },
  pr_pending:              { icon: Clock,         iconClass: "text-amber-400",   bgClass: "bg-amber-500/10 border-amber-500/20"    },
  pr_submitted:            { icon: ClipboardList, iconClass: "text-violet-400",  bgClass: "bg-violet-500/10 border-violet-500/20"  },
}

export function Topbar() {
  const { profile, roles, isAdmin } = useAuth()
  const isDirector = roles.includes("director")
  const isReception = roles.includes("reception")
  const displayName = useDisplayName()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [badgeCount, setBadgeCount] = useState(0)

  const LS_KEY = "notif_cleared_at"
  const getClearedAt = () => Number(localStorage.getItem(LS_KEY) ?? 0)

  useEffect(() => setMounted(true), [])

  // Fetch notifications on mount and every 60s
  useEffect(() => {
    async function load() {
      const result = await getNotifications()
      const clearedAt = getClearedAt()
      const filtered = clearedAt
        ? result.notifications.filter(n => new Date(n.timestamp).getTime() > clearedAt)
        : result.notifications
      setNotifications(filtered)
      setBadgeCount(filtered.filter(n =>
        n.kind === "team_leave_pending" || n.kind === "leave_approved" || n.kind === "leave_rejected" ||
        n.kind === "expense_pending_approval" || n.kind === "expense_approved" || n.kind === "expense_rejected" ||
        n.kind === "pr_submitted" || n.kind === "pr_approved" || n.kind === "pr_rejected"
      ).length)
    }
    load()
    const interval = setInterval(load, 60_000)
    return () => clearInterval(interval)
  }, [])

  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  const primaryRole = roles.includes("admin")
    ? "Employee"
    : roles.includes("director")
      ? "Director"
      : roles.includes("accounts")
        ? "Accounts"
        : roles.includes("reception")
          ? "Reception"
          : "Employee"

  const handleSignOut = () => {
    startTransition(async () => {
      await signOut()
    })
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-border/50 bg-card/80 backdrop-blur-md px-4 md:px-6 sticky top-0 z-50">
      <div className="flex items-center gap-3 md:hidden">
        <Link href="/" className="flex items-center gap-2">
          <img
            src="/logo.png"
            alt="UPTILLDAWN Crew"
            className="h-6"
          />
          <span className="font-semibold text-sm text-foreground">UPTILLDAWN</span>
        </Link>
      </div>

      <div className="hidden md:block" />

      <div className="flex items-center gap-2">
        {/* Role badge */}
        <span className="hidden sm:flex items-center rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground">
          {primaryRole}
        </span>

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted"
          aria-label="Toggle theme"
        >
          {mounted
            ? resolvedTheme === "dark"
              ? <Sun className="h-4 w-4" />
              : <Moon className="h-4 w-4" />
            : <div className="h-4 w-4" />
          }
        </button>

        {/* Notifications dropdown */}
        <DropdownMenu onOpenChange={open => { if (open) setBadgeCount(0) }}>
          <DropdownMenuTrigger asChild>
            <button
              className="relative flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted"
              aria-label="Notifications"
            >
              {badgeCount > 0 ? <BellRing className="h-4 w-4 text-rose-500" /> : <Bell className="h-4 w-4" />}
              {badgeCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-rose-500 text-[9px] font-bold text-white flex items-center justify-center leading-none animate-pulse">
                  {badgeCount > 9 ? "9+" : badgeCount}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-0 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <p className="text-sm font-semibold text-foreground">Notifications</p>
              <div className="flex items-center gap-2">
                {notifications.length > 0 && (
                  <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {notifications.length} item{notifications.length !== 1 ? "s" : ""}
                  </span>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); localStorage.setItem(LS_KEY, String(Date.now())); setNotifications([]); setBadgeCount(0) }}
                    className="text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {/* List */}
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8 px-4 text-center">
                <Bell className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-xs font-semibold text-foreground">All quiet!</p>
                <p className="text-[11px] text-muted-foreground">No recent leave or visitor activity.</p>
              </div>
            ) : (
              <div className="max-h-[340px] overflow-y-auto divide-y divide-border/30">
                {notifications.map((n) => {
                  const cfg = NOTIF_CONFIG[n.kind]
                  const Icon = cfg.icon
                  return (
                    <Link
                      key={n.id}
                      href={n.link}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                    >
                      <div className={`mt-0.5 h-7 w-7 shrink-0 rounded-lg border flex items-center justify-center ${cfg.bgClass}`}>
                        <Icon className={`h-3.5 w-3.5 ${cfg.iconClass}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold text-foreground leading-snug">{n.label}</p>
                          <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                            {new Date(n.timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                          </span>
                        </div>
                        {n.sub && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{n.sub}</p>}
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}

            {/* Footer */}
            <div className="border-t border-border/50 px-4 py-2.5">
              <Link href="/" className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-brand-taupe hover:underline">
                View all on dashboard <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User avatar + dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2" aria-label="User menu">
              <Avatar className="h-8 w-8 border border-border">
                {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={displayName} />}
                <AvatarFallback className="bg-brand-taupe text-primary-foreground text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>
              <p className="text-sm font-medium">{displayName}</p>
              <p className="text-xs text-muted-foreground">{profile?.email ?? ""}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">Settings</Link>
            </DropdownMenuItem>
            {(isAdmin || isDirector) && (
              <>
                {/* ── Leave ── */}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 py-1">
                  Leave
                </DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link href="/admin/leave" className="flex items-center gap-2">
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />Allowances
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/admin/leave-records" className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />Leave Records
                  </Link>
                </DropdownMenuItem>

                {/* ── Attendance ── */}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 py-1">
                  Attendance
                </DropdownMenuLabel>
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin/attendance" className="flex items-center gap-2">
                      <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />Live Attendance
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link href="/admin/roll-call" className="flex items-center gap-2">
                    <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />Roll Call
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/admin/forgotten-clockouts" className="flex items-center gap-2">
                    <LogOut className="h-3.5 w-3.5 text-muted-foreground" />Forgotten Clock-outs
                  </Link>
                </DropdownMenuItem>

                {/* ── Reports ── */}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 py-1">
                  Reports
                </DropdownMenuLabel>
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin/timesheets" className="flex items-center gap-2">
                      <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground" />My Timesheet
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link href="/timesheets" className="flex items-center gap-2">
                    <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground" />Staff Timesheets
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/admin/staff-summary" className="flex items-center gap-2">
                    <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />Staff Summary
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/analytics" className="flex items-center gap-2">
                    <BarChart2 className="h-3.5 w-3.5 text-muted-foreground" />Analytics
                  </Link>
                </DropdownMenuItem>

                {/* ── System (admin only) ── */}
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 py-1">
                      System
                    </DropdownMenuLabel>
                    <DropdownMenuItem asChild>
                      <Link href="/admin/users" className="flex items-center gap-2">
                        <Shield className="h-3.5 w-3.5 text-muted-foreground" />Roles &amp; Users
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/admin/notifications" className="flex items-center gap-2">
                        <BellRing className="h-3.5 w-3.5 text-muted-foreground" />Notifications
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/admin/audit" className="flex items-center gap-2">
                        <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />Audit Log
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/admin/system" className="flex items-center gap-2">
                        <Server className="h-3.5 w-3.5 text-muted-foreground" />System Status
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
              </>
            )}
            {isReception && !isAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 py-1">
                  Reception
                </DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link href="/admin/attendance" className="flex items-center gap-2">
                    <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />Attendance
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/admin/forgotten-clockouts" className="flex items-center gap-2">
                    <LogOut className="h-3.5 w-3.5 text-muted-foreground" />Forgotten Clock-outs
                  </Link>
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={handleSignOut}
              disabled={isPending}
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
