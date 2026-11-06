// Types mirroring the ASP.NET Core API DTOs. Enums are serialized as strings.

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PageQuery {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc' | '';
  search?: string;
}

export interface Lookup { id: number; name: string; code?: string | null; }

// ---------------- Auth ----------------
export interface CurrentUser {
  id: number;
  fullName: string;
  email: string;
  roles: string[];
  permissions: string[];
  employeeId: number | null;
  preferredLanguage: 'en' | 'ar' | string;
}
export interface AuthResponse { accessToken: string; expiresAt: string; user: CurrentUser; }

export const Roles = { SuperAdmin: 'SuperAdmin', Admin: 'Admin', Manager: 'Manager', Employee: 'Employee' } as const;

export const Perm = {
  UsersManage: 'users.manage',
  RolesManage: 'roles.manage',
  SettingsManage: 'settings.manage',
  DepartmentsManage: 'departments.manage',
  TeamsManage: 'teams.manage',
  EmployeesView: 'employees.view',
  EmployeesManage: 'employees.manage',
  AttendanceSelf: 'attendance.self',
  AttendanceViewTeam: 'attendance.view.team',
  AttendanceViewAll: 'attendance.view.all',
  AttendanceCorrect: 'attendance.correct',
  AttendanceKiosk: 'attendance.kiosk',
  LeaveApprove: 'leave.approve',
  HolidaysManage: 'holidays.manage',
  TasksAssign: 'tasks.assign',
  TasksReview: 'tasks.review',
  TasksViewAll: 'tasks.view.all',
  ReportsView: 'reports.view',
  ReportsExport: 'reports.export',
  AuditView: 'audit.view',
} as const;

// ---------------- Organization ----------------
export interface Department {
  id: number; name: string; nameAr: string | null; code: string; description: string | null; isActive: boolean;
  managerEmployeeId: number | null; managerName: string | null; employeeCount: number; teamCount: number; createdAt: string;
}
export interface SaveDepartment {
  name: string; nameAr: string | null; code: string; description: string | null; managerEmployeeId: number | null; isActive: boolean;
}

export interface Team {
  id: number; name: string; nameAr: string | null; description: string | null; isActive: boolean; departmentId: number;
  departmentName: string; leaderEmployeeId: number | null; leaderName: string | null; memberCount: number;
}
export interface TeamMember { employeeId: number; employeeCode: string; fullName: string; jobTitle: string | null; joinedOn: string; }
export interface TeamDetails { team: Team; members: TeamMember[]; }
export interface SaveTeam {
  name: string; nameAr: string | null; description: string | null; departmentId: number; leaderEmployeeId: number | null;
  memberEmployeeIds: number[] | null; isActive: boolean;
}

export interface Employee {
  id: number; employeeCode: string; firstName: string; lastName: string; fullName: string; email: string; phone: string | null;
  jobTitle: string | null; hireDate: string; isActive: boolean; allowRemoteCheckIn: boolean; departmentId: number;
  departmentName: string; workScheduleId: number | null; workScheduleName: string | null; userId: number | null;
  teams: { id: number; name: string }[]; createdAt: string;
}
export interface EmployeeQuery extends PageQuery { departmentId?: number | null; teamId?: number | null; isActive?: boolean | null; }
export interface CreateEmployee {
  employeeCode: string; firstName: string; lastName: string; email: string; phone: string | null; jobTitle: string | null;
  hireDate: string; departmentId: number; workScheduleId: number | null; teamIds: number[]; allowRemoteCheckIn: boolean;
  createAccount: boolean; password: string | null; role: string | null;
}
export interface UpdateEmployee {
  employeeCode: string; firstName: string; lastName: string; email: string; phone: string | null; jobTitle: string | null;
  hireDate: string; departmentId: number; workScheduleId: number | null; teamIds: number[]; allowRemoteCheckIn: boolean; isActive: boolean;
}

export interface User {
  id: number; fullName: string; email: string; isActive: boolean; roles: string[]; employeeId: number | null;
  employeeCode: string | null; lastLoginAt: string | null; isLockedOut: boolean; createdAt: string;
}
export interface Role { id: number; name: string; description: string; permissions: string[]; userCount: number; }
export interface UpdateUser { fullName: string; email: string; roles: string[]; isActive: boolean; employeeId: number | null; }
export interface RegisterUser { email: string; fullName: string; password: string; role: string; employeeId: number | null; }

// ---------------- Attendance ----------------
export type AttendanceStatus = 'Present' | 'Absent' | 'Late' | 'HalfDay' | 'EarlyLeave' | 'OnLeave' | 'Holiday' | 'WorkFromHome';
export const ATTENDANCE_STATUSES: AttendanceStatus[] =
  ['Present', 'Absent', 'Late', 'HalfDay', 'EarlyLeave', 'OnLeave', 'Holiday', 'WorkFromHome'];

/** Flags enum serialized as comma separated names, e.g. "Geofence, Network". */
export type VerificationMethod = string;

export interface AttendanceRecord {
  id: number; employeeId: number; employeeCode: string; employeeName: string; departmentId: number; departmentName: string;
  attendanceDate: string; shiftNumber: number; checkInTime: string | null; checkOutTime: string | null; workingHours: number;
  lateMinutes: number; earlyLeaveMinutes: number; status: AttendanceStatus; notes: string | null; missingCheckOut: boolean;
  checkInSource: string; checkInVerification: VerificationMethod; checkOutVerification: VerificationMethod;
  isManuallyEdited: boolean; createdAt: string; updatedAt: string;
}
export interface AttendanceDetails {
  record: AttendanceRecord; checkInIp: string | null; checkInLatitude: number | null; checkInLongitude: number | null;
  checkOutIp: string | null; checkOutLatitude: number | null; checkOutLongitude: number | null; lastEditedBy: string | null;
}
export interface AttendanceQuery extends PageQuery {
  from?: string | null; to?: string | null; employeeId?: number | null; employeeName?: string | null; employeeCode?: string | null;
  departmentId?: number | null; teamId?: number | null; status?: AttendanceStatus | null; missingCheckOut?: boolean | null;
  late?: boolean | null; earlyLeave?: boolean | null;
}
export interface VerificationRequirements {
  required: boolean; policy: 'Any' | 'All'; geofence: boolean; network: boolean; qrCode: boolean; requiredOnCheckOut: boolean; remoteAllowed: boolean;
}
export interface MyAttendanceStatus {
  today: string; isWorkingDay: boolean; holidayName: string | null; onLeave: boolean; scheduleStart: string; scheduleEnd: string;
  currentRecord: AttendanceRecord | null; todayRecords: AttendanceRecord[]; canCheckIn: boolean; canCheckOut: boolean;
  verification: VerificationRequirements;
}
export interface CheckRequest {
  latitude?: number | null; longitude?: number | null; accuracy?: number | null; qrToken?: string | null; notes?: string | null; workFromHome?: boolean;
}
export interface CorrectAttendance {
  checkInTime: string | null; checkOutTime: string | null; checkOutNextDay: boolean; status: AttendanceStatus | null; notes: string | null; reason: string;
}
export interface CreateManualAttendance extends CorrectAttendance { employeeId: number; attendanceDate: string; }

export type DailyState = 'Inside' | 'CheckedOut' | 'WorkFromHome' | 'MissingCheckOut' | 'OnLeave' | 'Holiday' | 'Weekend' | 'Upcoming' | 'Absent' | 'NotArrived';
export interface DailyRow {
  employeeId: number; employeeCode: string; employeeName: string; departmentId: number; departmentName: string; recordId: number | null;
  checkInTime: string | null; checkOutTime: string | null; workingHours: number; lateMinutes: number; earlyLeaveMinutes: number;
  status: AttendanceStatus | null; state: DailyState; isInside: boolean; notes: string | null;
}
export interface DailySummary {
  date: string; totalEmployees: number; expected: number; present: number; absent: number; late: number; onLeave: number;
  workFromHome: number; insideNow: number; earlyLeave: number; notCheckedOut: number; attendancePercentage: number;
}
export interface DailyAttendance { summary: DailySummary; rows: PagedResult<DailyRow>; }
export interface DailyQuery extends PageQuery { date?: string | null; departmentId?: number | null; teamId?: number | null; state?: string | null; }

export interface Absence {
  employeeId: number; employeeCode: string; employeeName: string; departmentId: number; departmentName: string; date: string;
  absenceStatus: 'Absent' | 'NotCheckedIn' | 'PendingLeave'; reason: string | null; recordId: number | null;
}
export interface AbsenceQuery extends PageQuery {
  date?: string | null; from?: string | null; to?: string | null; employeeId?: number | null; departmentId?: number | null;
  teamId?: number | null; employeeCode?: string | null;
}
export interface QrCode { token: string; url: string; pngBase64: string; expiresAt: string; rotationSeconds: number; }

export type LeaveType = 'Annual' | 'Sick' | 'Unpaid' | 'Emergency' | 'Other';
export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
export interface LeaveRequest {
  id: number; employeeId: number; employeeName: string; employeeCode: string; departmentName: string; type: LeaveType;
  startDate: string; endDate: string; days: number; reason: string | null; status: LeaveStatus; reviewedBy: string | null;
  reviewedAt: string | null; reviewNotes: string | null; createdAt: string;
}
export interface LeaveQuery extends PageQuery {
  employeeId?: number | null; departmentId?: number | null; status?: LeaveStatus | null; from?: string | null; to?: string | null; mine?: boolean;
}

// ---------------- Settings ----------------
export interface Settings {
  companyName: string; timeZoneId: string; allowMultipleShifts: boolean; maxShiftsPerDay: number; taskDeadlineReminderHours: number;
  attendanceFinalizeDelayMinutes: number; verificationPolicy: 'Any' | 'All'; requireVerificationOnCheckOut: boolean;
  geofenceEnabled: boolean; officeLatitude: number | null; officeLongitude: number | null; geofenceRadiusMeters: number;
  maxLocationAccuracyMeters: number; networkCheckEnabled: boolean; allowedIpRanges: string | null; qrCodeEnabled: boolean;
  qrRotationSeconds: number; updatedAt?: string;
}
export interface PublicSettings {
  companyName: string; timeZoneId: string; allowMultipleShifts: boolean; verificationPolicy: 'Any' | 'All';
  requireVerificationOnCheckOut: boolean; geofenceEnabled: boolean; networkCheckEnabled: boolean; qrCodeEnabled: boolean;
}
export interface TimeZoneItem { id: string; displayName: string; }
export type DayOfWeek = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
export const DAYS: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export interface WorkSchedule {
  id: number; name: string; startTime: string; endTime: string; lateGraceMinutes: number; earlyLeaveGraceMinutes: number;
  halfDayThresholdHours: number; weekendDays: DayOfWeek[]; isDefault: boolean; employeeCount: number;
}
export type SaveWorkSchedule = Omit<WorkSchedule, 'id' | 'employeeCount'>;
export interface Holiday { id: number; name: string; nameAr: string | null; startDate: string; endDate: string; description: string | null; }
export type SaveHoliday = Omit<Holiday, 'id'>;

// ---------------- Tasks ----------------
export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type TaskStatus = 'New' | 'Assigned' | 'InProgress' | 'PendingReview' | 'Completed' | 'Rejected' | 'Cancelled';
export const TASK_PRIORITIES: TaskPriority[] = ['Low', 'Medium', 'High', 'Urgent'];
export const TASK_STATUSES: TaskStatus[] = ['New', 'Assigned', 'InProgress', 'PendingReview', 'Completed', 'Rejected', 'Cancelled'];

export interface TaskAssignee { employeeId: number; employeeCode: string; fullName: string; }
export interface TaskItem {
  id: number; title: string; priority: TaskPriority; status: TaskStatus; progressPercent: number; startDate: string | null;
  dueDate: string | null; completionDate: string | null; isOverdue: boolean; assignedByUserId: number; assignedByName: string;
  departmentId: number | null; departmentName: string | null; teamId: number | null; teamName: string | null; assignees: TaskAssignee[]; commentCount: number; attachmentCount: number;
  createdAt: string; updatedAt: string;
}
export interface TaskComment { id: number; userId: number; userName: string; content: string; createdAt: string; }
export interface TaskAttachment { id: number; fileName: string; contentType: string; sizeBytes: number; uploadedByUserId: number; uploadedByName: string; createdAt: string; }
export interface TaskHistory { id: number; action: string; fromStatus: TaskStatus | null; toStatus: TaskStatus | null; details: string | null; changedBy: string | null; createdAt: string; }
export interface TaskPermissions { canEdit: boolean; canReview: boolean; canUpdateProgress: boolean; canComment: boolean; allowedStatuses: TaskStatus[]; }
export interface TaskDetails {
  task: TaskItem; description: string | null; reviewNotes: string | null; comments: TaskComment[]; attachments: TaskAttachment[];
  permissions: TaskPermissions; rowVersion: string;
}
export interface TaskQuery extends PageQuery {
  status?: TaskStatus | null; priority?: TaskPriority | null; assigneeId?: number | null; departmentId?: number | null; teamId?: number | null;
  overdue?: boolean | null; dueFrom?: string | null; dueTo?: string | null; mine?: boolean; createdByMe?: boolean;
}
export interface SaveTask {
  title: string; description: string | null; priority: TaskPriority; startDate: string | null; dueDate: string | null;
  departmentId: number | null; teamId: number | null; assigneeEmployeeIds: number[]; rowVersion?: string | null;
}
/** What the current user may pick in the task form (scoped by the server). */
export interface TaskTargets {
  departments: { id: number; name: string; nameAr: string | null }[];
  teams: { id: number; name: string; nameAr: string | null; departmentId: number }[];
  employees: { id: number; name: string; code: string; departmentId: number; teamIds: number[] }[];
}
export interface TaskDashboard {
  total: number; new: number; assigned: number; inProgress: number; pendingReview: number; completed: number; rejected: number;
  cancelled: number; overdue: number; dueThisWeek: number; byPriority: Record<TaskPriority, number>;
}

// ---------------- Notifications ----------------
export interface AppNotification {
  id: number; type: string; title: string; message: string; titleAr: string | null; messageAr: string | null; link: string | null;
  relatedEntityType: string | null; relatedEntityId: number | null; isRead: boolean; readAt: string | null; createdAt: string;
}

// ---------------- Reports ----------------
export interface ReportQuery {
  from?: string | null; to?: string | null; compareFrom?: string | null; compareTo?: string | null; departmentId?: number | null;
  teamId?: number | null; employeeId?: number | null;
}
export interface EmployeeAttendanceSummary {
  employeeId: number; employeeCode: string; employeeName: string; departmentName: string; expectedDays: number; presentDays: number;
  absentDays: number; lateDays: number; totalLateMinutes: number; earlyLeaveDays: number; halfDays: number; onLeaveDays: number;
  workFromHomeDays: number; missingCheckOuts: number; totalHours: number; averageHours: number; attendanceRate: number; punctualityRate: number;
}
export interface AttendanceTotals {
  from: string; to: string; employees: number; expectedDays: number; presentDays: number; absentDays: number; lateDays: number;
  earlyLeaveDays: number; onLeaveDays: number; totalHours: number; attendanceRate: number; punctualityRate: number;
}
export interface TrendPoint { date: string; present: number; absent: number; late: number; onLeave: number; }
export interface DepartmentAttendance { departmentId: number; departmentName: string; employees: number; presentDays: number; absentDays: number; lateDays: number; attendanceRate: number; }
export interface AttendanceReport {
  totals: AttendanceTotals; comparison: AttendanceTotals | null; rows: EmployeeAttendanceSummary[]; trend: TrendPoint[]; byDepartment: DepartmentAttendance[];
}
export interface TaskAssigneeStats {
  employeeId: number; employeeCode: string; employeeName: string; departmentName: string; assigned: number; completed: number;
  completedOnTime: number; inProgress: number; overdue: number; completionRate: number; onTimeRate: number; averageCompletionDays: number | null;
}
export interface TaskReport {
  total: number; byStatus: Record<string, number>; byPriority: Record<string, number>; byDepartment: { key: string; value: number }[];
  byAssignee: TaskAssigneeStats[]; overdue: number; completionRate: number; onTimeRate: number;
}
export interface EmployeePerformance {
  employeeId: number; employeeCode: string; employeeName: string; departmentName: string; attendanceRate: number; punctualityRate: number;
  totalHours: number; absentDays: number; lateDays: number; tasksAssigned: number; tasksCompleted: number; tasksCompletedOnTime: number;
  tasksOverdue: number; taskCompletionRate: number; onTimeRate: number; score: number;
}
export interface Dashboard { attendance: DailySummary | null; tasks: TaskDashboard; trend: TrendPoint[]; me: MyAttendanceStatus | null; }

export interface AuditLog {
  id: number; userId: number | null; userName: string | null; action: string; entityName: string; entityId: string | null;
  oldValues: string | null; newValues: string | null; reason: string | null; ipAddress: string | null; createdAt: string;
}

export interface ProblemDetails { title?: string; detail?: string; status?: number; errors?: Record<string, string[]>; }
