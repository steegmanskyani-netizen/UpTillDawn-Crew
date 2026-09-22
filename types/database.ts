// ============================================================
// TypeScript Database Types — StaffPortal
// All Insert/Update types are explicit (no self-referential Omit).
// Every table MUST have Relationships: [] to satisfy GenericTable
// from @supabase/postgrest-js (required since v0.17+).
// ============================================================

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

// ── Enum Types ───────────────────────────────────────────────

export type UserRole = 'employee' | 'responsible_lead' | 'admin' | 'director' | 'accounts' | 'reception'

export type AttendanceStatus =
    | 'present' | 'absent' | 'late' | 'wfh' | 'half_day' | 'holiday' | 'weekend'

export type LeaveType = 'annual' | 'sick' | 'personal' | 'compassionate' | 'unpaid' | 'maternity' | 'paternity'

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'withdrawn'

export type DayType = 'full' | 'half_am' | 'half_pm'

export type WfhType = 'full' | 'half_am' | 'half_pm'

export type VisitorStatus =
    | 'booked' | 'checked_in' | 'checked_out' | 'cancelled' | 'expired' | 'no_show'

export type FeedbackStatus = 'submitted' | 'under_review' | 'resolved' | 'closed'

export type ComplaintSeverity = 'low' | 'medium' | 'high' | 'critical'

export type ComplaintStatus = 'submitted' | 'investigating' | 'resolved' | 'closed'

export type CalendarEventType = 'leave' | 'wfh' | 'visitor' | 'holiday' | 'early_leave' | 'team'

export type CorrectionStatus = 'submitted' | 'approved' | 'rejected' | 'applied'

export type CorrectionField = 'clock_in' | 'clock_out' | 'break_start' | 'break_end'

export type AuditAction =
    | 'user_created'
    | 'user_updated'
    | 'role_assigned'
    | 'login'
    | 'logout'
    | 'leave_submitted'
    | 'leave_approved'
    | 'leave_rejected'
    | 'timesheet_submitted'
    | 'timesheet_approved'
    | 'timesheet_rejected'
    | 'visitor_booked'
    | 'visitor_checked_in'
    | 'visitor_checked_out'
    | 'visitor_cancelled'
    | 'attendance_correction_requested'
    | 'attendance_correction_approved'
    | 'attendance_correction_rejected'
    | 'calendar_event_created'
    | 'calendar_event_updated'
    | 'calendar_event_deleted'
    | 'kiosk_clock_in'
    | 'kiosk_clock_out'
    | 'correction_submitted' | 'correction_approved' | 'correction_rejected' | 'direct_correction_applied'
    | 'password_reset' | 'login' | 'logout'
    | 'department_created' | 'department_updated' | 'department_deleted'
    | 'location_created' | 'location_updated' | 'location_deleted'
    | 'contact_created' | 'contact_deleted'
    | 'calendar_event_created' | 'calendar_event_deleted'
    | 'approver_updated' | 'kiosk_pin_updated'
    | 'feedback_status_updated' | 'complaint_status_updated'
    | 'expense_submitted' | 'expense_approved' | 'expense_rejected' | 'expense_paid'
    | 'purchase_request_submitted' | 'purchase_request_approved' | 'purchase_request_rejected'
    | 'sso_login' | 'leave_accrued' | 'gdpr_export'

export type ExpenseStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid'
export type PrStatus = 'submitted' | 'approved' | 'rejected' | 'ordered' | 'cancelled'
export type ApprovalDecision = 'approved' | 'rejected' | 'pending'

export type WorkDayCode = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export type HoursByDay = Partial<Record<WorkDayCode, number>>

export interface WorkSchedule {
    user_id: string
    work_days: WorkDayCode[]
    daily_hours: number          // average of hours_by_day (kept for backwards compat)
    hours_by_day: HoursByDay | null  // per-weekday contracted hours
    updated_at: string
}

// ── Table Row Types ──────────────────────────────────────────

export interface Database {
    public: {
        Tables: {
            departments: {
                Row: {
                    id: string
                    name: string
                    description: string | null
                    head_user_id: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    name: string
                    description?: string | null
                    head_user_id?: string | null
                }
                Update: {
                    name?: string
                    description?: string | null
                    head_user_id?: string | null
                }
                Relationships: []
            }
            locations: {
                Row: {
                    id: string
                    name: string
                    address: string | null
                    city: string | null
                    postcode: string | null
                    capacity: number
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    name: string
                    address?: string | null
                    city?: string | null
                    postcode?: string | null
                    capacity?: number
                }
                Update: {
                    name?: string
                    address?: string | null
                    city?: string | null
                    postcode?: string | null
                    capacity?: number
                }
                Relationships: []
            }
            user_profiles: {
                Row: {
                    id: string
                    email: string
                    full_name: string
                    display_name: string | null
                    job_title: string | null
                    department_id: string | null
                    location_id: string | null
                    desk_extension: string | null
                    phone: string | null
                    avatar_url: string | null
                    kiosk_pin: string | null
                    gender?: string | null
                    is_active: boolean
                    is_email_verified: boolean
                    exclude_from_reminders: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id: string
                    email: string
                    full_name: string
                    display_name?: string | null
                    job_title?: string | null
                    department_id?: string | null
                    location_id?: string | null
                    desk_extension?: string | null
                    phone?: string | null
                    avatar_url?: string | null
                    kiosk_pin?: string | null
                    gender?: string | null
                    is_active?: boolean
                    is_email_verified?: boolean
                    exclude_from_reminders?: boolean
                }
                Update: {
                    email?: string
                    full_name?: string
                    display_name?: string | null
                    job_title?: string | null
                    department_id?: string | null
                    location_id?: string | null
                    desk_extension?: string | null
                    phone?: string | null
                    avatar_url?: string | null
                    kiosk_pin?: string | null
                    gender?: string | null
                    is_active?: boolean
                    is_email_verified?: boolean
                    exclude_from_reminders?: boolean
                }
                Relationships: []
            }
            external_contacts: {
                Row: {
                    id: string
                    added_by: string
                    name: string
                    email: string | null
                    phone: string | null
                    company: string | null
                    job_title: string | null
                    notes: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    added_by: string
                    name: string
                    email?: string | null
                    phone?: string | null
                    company?: string | null
                    job_title?: string | null
                    notes?: string | null
                }
                Update: {
                    name?: string
                    email?: string | null
                    phone?: string | null
                    company?: string | null
                    job_title?: string | null
                    notes?: string | null
                }
                Relationships: []
            }
            user_roles: {
                Row: {
                    id: string
                    user_id: string
                    role: UserRole
                    assigned_by: string | null
                    assigned_at: string
                }
                Insert: {
                    user_id: string
                    role: UserRole
                    assigned_by?: string | null
                }
                Update: {
                    user_id?: string
                    role?: UserRole
                    assigned_by?: string | null
                }
                Relationships: []
            }
            user_approvers: {
                Row: {
                    id: string
                    user_id: string
                    approver_id: string
                    priority: number
                    created_at: string
                }
                Insert: {
                    user_id: string
                    approver_id: string
                    priority?: number
                }
                Update: {
                    user_id?: string
                    approver_id?: string
                    priority?: number
                }
                Relationships: []
            }
            attendance: {
                Row: {
                    id: string
                    user_id: string
                    work_date: string
                    clock_in: string | null
                    clock_out: string | null
                    break_start: string | null
                    break_end: string | null
                    total_hours: number | null
                    status: AttendanceStatus
                    early_leave: boolean
                    early_leave_reason: string | null
                    notes: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    user_id: string
                    work_date: string
                    clock_in?: string | null
                    clock_out?: string | null
                    break_start?: string | null
                    break_end?: string | null
                    total_hours?: number | null
                    status?: AttendanceStatus
                    early_leave?: boolean
                    early_leave_reason?: string | null
                    notes?: string | null
                }
                Update: {
                    user_id?: string
                    work_date?: string
                    clock_in?: string | null
                    clock_out?: string | null
                    break_start?: string | null
                    break_end?: string | null
                    total_hours?: number | null
                    status?: AttendanceStatus
                    early_leave?: boolean
                    early_leave_reason?: string | null
                    notes?: string | null
                }
                Relationships: []
            }
            attendance_corrections: {
                Row: {
                    id: string
                    attendance_id: string
                    user_id: string
                    field: CorrectionField
                    original_value: string | null
                    proposed_value: string
                    reason: string
                    status: CorrectionStatus
                    reviewed_by: string | null
                    reviewed_at: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    attendance_id: string
                    user_id: string
                    field: CorrectionField
                    original_value?: string | null
                    proposed_value: string
                    reason: string
                    status?: CorrectionStatus
                    reviewed_by?: string | null
                    reviewed_at?: string | null
                }
                Update: {
                    attendance_id?: string
                    user_id?: string
                    field?: CorrectionField
                    original_value?: string | null
                    proposed_value?: string
                    reason?: string
                    status?: CorrectionStatus
                    reviewed_by?: string | null
                    reviewed_at?: string | null
                }
                Relationships: []
            }
            wfh_records: {
                Row: {
                    id: string
                    user_id: string
                    wfh_date: string
                    wfh_type: WfhType
                    notes: string | null
                    created_at: string
                }
                Insert: {
                    user_id: string
                    wfh_date: string
                    wfh_type?: WfhType
                    notes?: string | null
                }
                Update: {
                    user_id?: string
                    wfh_date?: string
                    wfh_type?: WfhType
                    notes?: string | null
                }
                Relationships: []
            }
            leave_balances: {
                Row: {
                    id: string
                    user_id: string
                    leave_type: LeaveType
                    total: number
                    used: number
                    pending: number
                    year: number
                    carried_forward?: number
                    accrual_rate?: number
                    accrued_to_date?: number
                    last_accrued_on?: string | null
                    updated_at: string
                }
                Insert: {
                    user_id: string
                    leave_type: LeaveType
                    total?: number
                    used?: number
                    pending?: number
                    year?: number
                    carried_forward?: number
                    accrual_rate?: number
                    accrued_to_date?: number
                    last_accrued_on?: string | null
                }
                Update: {
                    user_id?: string
                    leave_type?: LeaveType
                    total?: number
                    used?: number
                    pending?: number
                    year?: number
                    carried_forward?: number
                    accrual_rate?: number
                    accrued_to_date?: number
                    last_accrued_on?: string | null
                }
                Relationships: []
            }
            sso_connections: {
                Row: {
                    id: string
                    domain: string
                    provider: string
                    display_name: string
                    is_active: boolean
                    created_at: string
                }
                Insert: {
                    domain: string
                    provider: string
                    display_name: string
                    is_active?: boolean
                }
                Update: {
                    domain?: string
                    provider?: string
                    display_name?: string
                    is_active?: boolean
                }
                Relationships: []
            }
            leave_requests: {
                Row: {
                    id: string
                    user_id: string
                    leave_type: LeaveType
                    start_date: string
                    end_date: string
                    day_type: DayType
                    days_count: number
                    reason: string
                    status: LeaveStatus
                    approver_id: string | null
                    reviewed_at: string | null
                    rejection_reason: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    user_id: string
                    leave_type: LeaveType
                    start_date: string
                    end_date: string
                    day_type?: DayType
                    days_count: number
                    reason: string
                    status?: LeaveStatus
                    approver_id?: string | null
                    reviewed_at?: string | null
                    rejection_reason?: string | null
                }
                Update: {
                    user_id?: string
                    leave_type?: LeaveType
                    start_date?: string
                    end_date?: string
                    day_type?: DayType
                    days_count?: number
                    reason?: string
                    status?: LeaveStatus
                    approver_id?: string | null
                    reviewed_at?: string | null
                    rejection_reason?: string | null
                }
                Relationships: []
            }
            visitors: {
                Row: {
                    id: string
                    host_user_id: string
                    visitor_name: string
                    visitor_email: string
                    visitor_phone: string | null
                    company: string | null
                    purpose: string
                    visit_date: string
                    time_window_start: string
                    time_window_end: string
                    location_id: string | null
                    guest_count: number
                    requires_id: boolean
                    accessibility_notes: string | null
                    reference_code: string
                    status: VisitorStatus
                    badge_number: string | null
                    checked_in_at: string | null
                    checked_out_at: string | null
                    checked_in_by: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    host_user_id: string
                    visitor_name: string
                    visitor_email: string
                    visitor_phone?: string | null
                    company?: string | null
                    purpose: string
                    visit_date: string
                    time_window_start: string
                    time_window_end: string
                    location_id?: string | null
                    guest_count?: number
                    requires_id?: boolean
                    accessibility_notes?: string | null
                    reference_code: string
                    status?: VisitorStatus
                    badge_number?: string | null
                    checked_in_at?: string | null
                    checked_out_at?: string | null
                    checked_in_by?: string | null
                }
                Update: {
                    host_user_id?: string
                    visitor_name?: string
                    visitor_email?: string
                    visitor_phone?: string | null
                    company?: string | null
                    purpose?: string
                    visit_date?: string
                    time_window_start?: string
                    time_window_end?: string
                    location_id?: string | null
                    guest_count?: number
                    requires_id?: boolean
                    accessibility_notes?: string | null
                    reference_code?: string
                    status?: VisitorStatus
                    badge_number?: string | null
                    checked_in_at?: string | null
                    checked_out_at?: string | null
                    checked_in_by?: string | null
                }
                Relationships: []
            }
            calendar_events: {
                Row: {
                    id: string
                    user_id: string | null
                    title: string
                    description: string | null
                    event_date: string
                    event_end_date: string | null
                    event_type: CalendarEventType
                    source_id: string | null
                    source_table: string | null
                    is_all_day: boolean
                    is_company_wide: boolean
                    department_id: string | null
                    location_id: string | null
                    created_at: string
                }
                Insert: {
                    user_id?: string | null
                    title: string
                    description?: string | null
                    event_date: string
                    event_end_date?: string | null
                    event_type: CalendarEventType
                    source_id?: string | null
                    source_table?: string | null
                    is_all_day?: boolean
                    is_company_wide?: boolean
                    department_id?: string | null
                    location_id?: string | null
                }
                Update: {
                    user_id?: string | null
                    title?: string
                    description?: string | null
                    event_date?: string
                    event_end_date?: string | null
                    event_type?: CalendarEventType
                    source_id?: string | null
                    source_table?: string | null
                    is_all_day?: boolean
                    is_company_wide?: boolean
                    department_id?: string | null
                    location_id?: string | null
                }
                Relationships: []
            }
            diary_entries: {
                Row: {
                    id: string
                    user_id: string
                    title: string
                    content: string | null
                    tags: string[]
                    reminder_at: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    user_id: string
                    title: string
                    content?: string | null
                    tags?: string[]
                    reminder_at?: string | null
                }
                Update: {
                    user_id?: string
                    title?: string
                    content?: string | null
                    tags?: string[]
                    reminder_at?: string | null
                }
                Relationships: []
            }
            feedback: {
                Row: {
                    id: string
                    user_id: string
                    subject: string
                    message: string
                    category: string
                    status: FeedbackStatus
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    user_id: string
                    subject: string
                    message: string
                    category: string
                    status?: FeedbackStatus
                }
                Update: {
                    user_id?: string
                    subject?: string
                    message?: string
                    category?: string
                    status?: FeedbackStatus
                }
                Relationships: []
            }
            complaints: {
                Row: {
                    id: string
                    user_id: string | null
                    subject: string
                    message: string
                    severity: ComplaintSeverity
                    category: string
                    is_anonymous: boolean
                    status: ComplaintStatus
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    user_id?: string | null
                    subject: string
                    message: string
                    severity?: ComplaintSeverity
                    category: string
                    is_anonymous?: boolean
                    status?: ComplaintStatus
                }
                Update: {
                    user_id?: string | null
                    subject?: string
                    message?: string
                    severity?: ComplaintSeverity
                    category?: string
                    is_anonymous?: boolean
                    status?: ComplaintStatus
                }
                Relationships: []
            }
            audit_logs: {
                Row: {
                    id: string
                    actor_id: string | null
                    actor_email: string | null
                    action: AuditAction
                    entity_table: string
                    entity_id: string | null
                    before_data: Json | null
                    after_data: Json | null
                    ip_address: string | null
                    user_agent: string | null
                    created_at: string
                }
                Insert: {
                    actor_id?: string | null
                    actor_email?: string | null
                    action: AuditAction
                    entity_table: string
                    entity_id?: string | null
                    before_data?: Json | null
                    after_data?: Json | null
                    ip_address?: string | null
                    user_agent?: string | null
                }
                Update: never
                Relationships: []
            }
            email_templates: {
                Row: {
                    id: string
                    name: string
                    subject: string
                    html_body: string
                    text_body: string | null
                    category: string
                    variables: string[]
                    is_active: boolean
                    version: number
                    created_by: string | null
                    updated_by: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    name: string
                    subject: string
                    html_body: string
                    text_body?: string | null
                    category?: string
                    variables?: string[]
                    is_active?: boolean
                    version?: number
                    created_by?: string | null
                    updated_by?: string | null
                }
                Update: {
                    name?: string
                    subject?: string
                    html_body?: string
                    text_body?: string | null
                    category?: string
                    variables?: string[]
                    is_active?: boolean
                    version?: number
                    created_by?: string | null
                    updated_by?: string | null
                }
                Relationships: []
            }
            work_schedules: {
                Row: {
                    id: string
                    user_id: string
                    work_days: string[]
                    daily_hours: number
                    updated_at: string
                }
                Insert: {
                    user_id: string
                    work_days?: string[]
                    daily_hours?: number
                    updated_at?: string
                }
                Update: {
                    work_days?: string[]
                    daily_hours?: number
                    updated_at?: string
                }
                Relationships: []
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            current_user_has_role: {
                Args: { check_role: UserRole }
                Returns: boolean
            }
            current_user_roles: {
                Args: Record<string, never>
                Returns: UserRole[]
            }
        }
        Enums: {
            user_role: UserRole
            attendance_status: AttendanceStatus
            leave_type: LeaveType
            leave_status: LeaveStatus
            day_type: DayType
            visitor_status: VisitorStatus
            feedback_status: FeedbackStatus
            complaint_severity: ComplaintSeverity
            complaint_status: ComplaintStatus
            calendar_event_type: CalendarEventType
            correction_status: CorrectionStatus
            correction_field: CorrectionField
            audit_action: AuditAction
            expense_status: ExpenseStatus
            pr_status: PrStatus
            approval_decision: ApprovalDecision
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}

// ── Expense module convenience types ─────────────────────────

export interface ExpenseCategory {
    id: string
    name: string
    icon: string
    color: string
    created_by: string | null
    created_at: string
}

export interface CompanyCard {
    id: string
    label: string
    last4: string
    card_holder: string
    card_type: string
    is_active: boolean
    created_at: string
}

export interface ApprovalChainStep {
    role?: string
    user_id?: string
    label: string
}

export interface ExpenseApprovalChain {
    id: string
    name: string
    steps: ApprovalChainStep[]
    is_default: boolean
    created_by: string | null
    created_at: string
}

export interface Expense {
    id: string
    user_id: string
    amount: number
    currency: string
    converted_gbp: number | null
    exchange_rate: number | null
    category_id: string | null
    date: string
    description: string
    merchant: string | null
    card_id: string | null
    receipt_url: string | null
    receipt_data: Record<string, any> | null
    approval_chain_id: string | null
    current_step: number
    status: ExpenseStatus
    notes: string | null
    submitted_at: string | null
    created_at: string
    // joins
    expense_categories?: ExpenseCategory | null
    company_cards?: CompanyCard | null
    user_profiles?: { full_name: string; email: string; display_name: string | null } | null
    expense_approvals?: ExpenseApproval[]
}

export interface ExpenseApproval {
    id: string
    expense_id: string
    step: number
    approver_id: string
    decision: ApprovalDecision
    note: string | null
    decided_at: string | null
    created_at: string
    user_profiles?: { full_name: string; email: string } | null
}

export interface PurchaseRequest {
    id: string
    user_id: string
    item_name: string
    description: string | null
    estimated_cost: number
    currency: string
    converted_gbp: number | null
    exchange_rate: number | null
    supplier: string | null
    justification: string | null
    urgency: string
    approval_chain_id: string | null
    current_step: number
    status: PrStatus
    notes: string | null
    submitted_at: string
    created_at: string
    // joins
    user_profiles?: { full_name: string; email: string; display_name: string | null } | null
    pr_approvals?: PrApproval[]
    pr_attachments?: PrAttachment[]
}

export interface PrApproval {
    id: string
    pr_id: string
    step: number
    approver_id: string
    decision: ApprovalDecision
    note: string | null
    decided_at: string | null
    created_at: string
    user_profiles?: { full_name: string; email: string } | null
}

export interface PrAttachment {
    id: string
    pr_id: string
    file_url: string
    file_name: string
    created_at: string
}

// ── Convenience aliases ──────────────────────────────────────

export type Tables<T extends keyof Database['public']['Tables']> =
    Database['public']['Tables'][T]['Row']

export type TablesInsert<T extends keyof Database['public']['Tables']> =
    Database['public']['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
    Database['public']['Tables'][T]['Update']
