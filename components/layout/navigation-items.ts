import type { LucideIcon } from "lucide-react"
import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  FileSpreadsheet,
  LayoutDashboard,
  ListChecks,
  MapPin,
  MessageCircle,
  ScrollText,
  Settings,
  UserCheck,
  Users,
} from "lucide-react"

export type NavigationItem = {
  key: string
  href: string
  label: string
  icon: LucideIcon
  roles: string[]
}

export const NAV_ITEMS: NavigationItem[] = [
  { key:"overview", href:"/", label:"Overzicht", icon:LayoutDashboard, roles:["employee","responsible_lead","admin"] },
  { key:"operations", href:"/operations", label:"Mijn werkuren", icon:Clock3, roles:["employee","responsible_lead","admin"] },
  { key:"events", href:"/events", label:"Evenementen", icon:CalendarDays, roles:["employee","responsible_lead","admin"] },
  { key:"workplaces", href:"/workplaces", label:"Werkplekken", icon:MapPin, roles:["employee","responsible_lead","admin"] },
  { key:"shifts", href:"/shifts", label:"Diensten", icon:Clock3, roles:["employee","responsible_lead","admin"] },
  { key:"briefings", href:"/briefings", label:"Instructies", icon:ScrollText, roles:["employee","responsible_lead","admin"] },
  { key:"tasks", href:"/tasks", label:"Taken", icon:ListChecks, roles:["employee","responsible_lead","admin"] },
  { key:"chat", href:"/chat", label:"Gesprekken", icon:MessageCircle, roles:["employee","responsible_lead","admin"] },
  { key:"crew", href:"/crew", label:"Personeel", icon:Users, roles:["employee","responsible_lead","admin"] },
  { key:"incidents", href:"/incidents", label:"Incidenten", icon:AlertTriangle, roles:["employee","responsible_lead","admin"] },
  { key:"exports", href:"/exports", label:"Excel", icon:FileSpreadsheet, roles:["admin"] },
  { key:"personnel", href:"/personnel", label:"Personeel & goedkeuringen", icon:UserCheck, roles:["admin"] },
  { key:"settings", href:"/settings", label:"Instellingen", icon:Settings, roles:["employee","responsible_lead","admin"] },
]
