import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  Absence, AbsenceQuery, AppNotification, AttendanceDetails, AttendanceQuery, AttendanceRecord, AttendanceReport, AuditLog,
  CheckRequest, CorrectAttendance, CreateEmployee, CreateManualAttendance, DailyAttendance, DailyQuery, DailySummary, Dashboard,
  Department, Employee, EmployeePerformance, EmployeeQuery, Holiday, LeaveQuery, LeaveRequest, LeaveType, Lookup,
  MyAttendanceStatus, PagedResult, PageQuery, PublicSettings, QrCode, RegisterUser, ReportQuery, Role, SaveDepartment, SaveHoliday,
  SaveTask, TaskTargets, SaveTeam, SaveWorkSchedule, Settings, TaskComment, TaskAttachment, TaskDashboard, TaskDetails, TaskHistory, TaskItem,
  TaskQuery, TaskReport, TaskStatus, TeamDetails, Team, TimeZoneItem, UpdateEmployee, UpdateUser, User, WorkSchedule, CurrentUser,
} from './models';

/** Builds HttpParams, dropping null/undefined/empty values. */
export function toParams(query: object | null | undefined): HttpParams {
  let params = new HttpParams();
  if (!query) return params;
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === '') continue;
    params = params.set(key, String(value));
  }
  return params;
}

export type ExportFormat = 'xlsx' | 'pdf';

/** Typed client for every backend endpoint. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api';

  // ---------- auth ----------
  me() { return this.http.get<CurrentUser>(`${this.base}/auth/me`); }
  changePassword(currentPassword: string, newPassword: string) {
    return this.http.post<void>(`${this.base}/auth/change-password`, { currentPassword, newPassword });
  }
  setLanguage(language: string) { return this.http.put<void>(`${this.base}/auth/language`, { language }); }
  register(body: RegisterUser) { return this.http.post<CurrentUser>(`${this.base}/auth/register`, body); }

  // ---------- dashboard ----------
  dashboard() { return this.http.get<Dashboard>(`${this.base}/dashboard`); }

  // ---------- employees ----------
  employees(q: EmployeeQuery) { return this.http.get<PagedResult<Employee>>(`${this.base}/employees`, { params: toParams(q) }); }
  employeeLookup(departmentId?: number | null, teamId?: number | null) {
    return this.http.get<Lookup[]>(`${this.base}/employees/lookup`, { params: toParams({ departmentId, teamId }) });
  }
  employee(id: number) { return this.http.get<Employee>(`${this.base}/employees/${id}`); }
  createEmployee(body: CreateEmployee) { return this.http.post<Employee>(`${this.base}/employees`, body); }
  updateEmployee(id: number, body: UpdateEmployee) { return this.http.put<Employee>(`${this.base}/employees/${id}`, body); }
  deleteEmployee(id: number) { return this.http.delete<void>(`${this.base}/employees/${id}`); }

  // ---------- departments / teams ----------
  departments() { return this.http.get<Department[]>(`${this.base}/departments`); }
  departmentLookup() { return this.http.get<Lookup[]>(`${this.base}/departments/lookup`); }
  createDepartment(body: SaveDepartment) { return this.http.post<Department>(`${this.base}/departments`, body); }
  updateDepartment(id: number, body: SaveDepartment) { return this.http.put<Department>(`${this.base}/departments/${id}`, body); }
  deleteDepartment(id: number) { return this.http.delete<void>(`${this.base}/departments/${id}`); }

  teams(departmentId?: number | null) { return this.http.get<Team[]>(`${this.base}/teams`, { params: toParams({ departmentId }) }); }
  teamLookup(departmentId?: number | null) { return this.http.get<Lookup[]>(`${this.base}/teams/lookup`, { params: toParams({ departmentId }) }); }
  team(id: number) { return this.http.get<TeamDetails>(`${this.base}/teams/${id}`); }
  createTeam(body: SaveTeam) { return this.http.post<TeamDetails>(`${this.base}/teams`, body); }
  updateTeam(id: number, body: SaveTeam) { return this.http.put<TeamDetails>(`${this.base}/teams/${id}`, body); }
  deleteTeam(id: number) { return this.http.delete<void>(`${this.base}/teams/${id}`); }
  addTeamMember(id: number, employeeId: number) { return this.http.post<void>(`${this.base}/teams/${id}/members/${employeeId}`, {}); }
  removeTeamMember(id: number, employeeId: number) { return this.http.delete<void>(`${this.base}/teams/${id}/members/${employeeId}`); }

  // ---------- users / roles ----------
  users(q: PageQuery & { role?: string | null; isActive?: boolean | null }) {
    return this.http.get<PagedResult<User>>(`${this.base}/users`, { params: toParams(q) });
  }
  updateUser(id: number, body: UpdateUser) { return this.http.put<User>(`${this.base}/users/${id}`, body); }
  resetPassword(id: number, newPassword: string) { return this.http.post<void>(`${this.base}/users/${id}/reset-password`, { newPassword }); }
  unlockUser(id: number) { return this.http.post<void>(`${this.base}/users/${id}/unlock`, {}); }
  deleteUser(id: number) { return this.http.delete<void>(`${this.base}/users/${id}`); }
  roles() { return this.http.get<Role[]>(`${this.base}/roles`); }

  // ---------- attendance ----------
  myAttendanceStatus() { return this.http.get<MyAttendanceStatus>(`${this.base}/attendance/me/status`); }
  myAttendanceHistory(q: AttendanceQuery) {
    return this.http.get<PagedResult<AttendanceRecord>>(`${this.base}/attendance/me/history`, { params: toParams(q) });
  }
  checkIn(body: CheckRequest) { return this.http.post<AttendanceRecord>(`${this.base}/attendance/check-in`, body); }
  checkOut(body: CheckRequest) { return this.http.post<AttendanceRecord>(`${this.base}/attendance/check-out`, body); }
  attendance(q: AttendanceQuery) { return this.http.get<PagedResult<AttendanceRecord>>(`${this.base}/attendance`, { params: toParams(q) }); }
  attendanceDaily(q: DailyQuery) { return this.http.get<DailyAttendance>(`${this.base}/attendance/daily`, { params: toParams(q) }); }
  attendanceDailySummary(date?: string | null) {
    return this.http.get<DailySummary>(`${this.base}/attendance/daily/summary`, { params: toParams({ date }) });
  }
  absences(q: AbsenceQuery) { return this.http.get<PagedResult<Absence>>(`${this.base}/attendance/absent`, { params: toParams(q) }); }
  employeeAttendance(employeeId: number, q: AttendanceQuery) {
    return this.http.get<PagedResult<AttendanceRecord>>(`${this.base}/attendance/employee/${employeeId}`, { params: toParams(q) });
  }
  attendanceDetails(id: number) { return this.http.get<AttendanceDetails>(`${this.base}/attendance/${id}`); }
  correctAttendance(id: number, body: CorrectAttendance) { return this.http.put<AttendanceRecord>(`${this.base}/attendance/${id}`, body); }
  createManualAttendance(body: CreateManualAttendance) { return this.http.post<AttendanceRecord>(`${this.base}/attendance/manual`, body); }
  kioskQr() { return this.http.get<QrCode>(`${this.base}/attendance/kiosk/qr`); }
  exportAttendance(q: AttendanceQuery, format: ExportFormat) {
    return this.download(`${this.base}/attendance/export`, { ...q, page: undefined, pageSize: undefined, format });
  }

  // ---------- leave ----------
  leaveRequests(q: LeaveQuery) { return this.http.get<PagedResult<LeaveRequest>>(`${this.base}/leave-requests`, { params: toParams(q) }); }
  createLeave(body: { employeeId: number | null; type: LeaveType; startDate: string; endDate: string; reason: string | null }) {
    return this.http.post<LeaveRequest>(`${this.base}/leave-requests`, body);
  }
  reviewLeave(id: number, approve: boolean, notes: string | null) {
    return this.http.post<LeaveRequest>(`${this.base}/leave-requests/${id}/review`, { approve, notes });
  }
  cancelLeave(id: number) { return this.http.post<void>(`${this.base}/leave-requests/${id}/cancel`, {}); }

  // ---------- settings ----------
  settings() { return this.http.get<Settings>(`${this.base}/settings`); }
  publicSettings() { return this.http.get<PublicSettings>(`${this.base}/settings/public`); }
  updateSettings(body: Settings) { return this.http.put<Settings>(`${this.base}/settings`, body); }
  regenerateQrSecret() { return this.http.post<void>(`${this.base}/settings/qr-secret/regenerate`, {}); }
  timeZones() { return this.http.get<TimeZoneItem[]>(`${this.base}/settings/timezones`); }
  myIp() { return this.http.get<{ ip: string }>(`${this.base}/settings/my-ip`); }
  workSchedules() { return this.http.get<WorkSchedule[]>(`${this.base}/work-schedules`); }
  createWorkSchedule(body: SaveWorkSchedule) { return this.http.post<WorkSchedule>(`${this.base}/work-schedules`, body); }
  updateWorkSchedule(id: number, body: SaveWorkSchedule) { return this.http.put<WorkSchedule>(`${this.base}/work-schedules/${id}`, body); }
  deleteWorkSchedule(id: number) { return this.http.delete<void>(`${this.base}/work-schedules/${id}`); }
  holidays(year?: number | null) { return this.http.get<Holiday[]>(`${this.base}/holidays`, { params: toParams({ year }) }); }
  createHoliday(body: SaveHoliday) { return this.http.post<Holiday>(`${this.base}/holidays`, body); }
  updateHoliday(id: number, body: SaveHoliday) { return this.http.put<Holiday>(`${this.base}/holidays/${id}`, body); }
  deleteHoliday(id: number) { return this.http.delete<void>(`${this.base}/holidays/${id}`); }

  // ---------- tasks ----------
  tasks(q: TaskQuery) { return this.http.get<PagedResult<TaskItem>>(`${this.base}/tasks`, { params: toParams(q) }); }
  myTasks(q: TaskQuery) { return this.http.get<PagedResult<TaskItem>>(`${this.base}/tasks/my-tasks`, { params: toParams(q) }); }
  taskDashboard(mine = false) { return this.http.get<TaskDashboard>(`${this.base}/tasks/dashboard`, { params: toParams({ mine }) }); }
  task(id: number) { return this.http.get<TaskDetails>(`${this.base}/tasks/${id}`); }
  taskTargets() { return this.http.get<TaskTargets>(`${this.base}/tasks/targets`); }
  createTask(body: SaveTask) { return this.http.post<TaskDetails>(`${this.base}/tasks`, body); }
  updateTask(id: number, body: SaveTask) { return this.http.put<TaskDetails>(`${this.base}/tasks/${id}`, body); }
  deleteTask(id: number) { return this.http.delete<void>(`${this.base}/tasks/${id}`); }
  changeTaskStatus(id: number, status: TaskStatus, note?: string | null, progressPercent?: number | null) {
    return this.http.patch<TaskDetails>(`${this.base}/tasks/${id}/status`, { status, note: note ?? null, progressPercent: progressPercent ?? null });
  }
  updateTaskProgress(id: number, progressPercent: number, note?: string | null) {
    return this.http.patch<TaskDetails>(`${this.base}/tasks/${id}/progress`, { progressPercent, note: note ?? null });
  }
  addTaskComment(id: number, content: string) { return this.http.post<TaskComment>(`${this.base}/tasks/${id}/comments`, { content }); }
  taskHistory(id: number) { return this.http.get<TaskHistory[]>(`${this.base}/tasks/${id}/history`); }
  uploadTaskAttachment(id: number, file: File) {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<TaskAttachment>(`${this.base}/tasks/${id}/attachments`, form);
  }
  downloadTaskAttachment(id: number, attachmentId: number) {
    return this.download(`${this.base}/tasks/${id}/attachments/${attachmentId}`, {});
  }
  deleteTaskAttachment(id: number, attachmentId: number) {
    return this.http.delete<void>(`${this.base}/tasks/${id}/attachments/${attachmentId}`);
  }
  exportTasks(q: TaskQuery, format: ExportFormat) {
    return this.download(`${this.base}/tasks/export`, { ...q, page: undefined, pageSize: undefined, format });
  }

  // ---------- notifications ----------
  notifications(q: PageQuery & { unreadOnly?: boolean | null; type?: string | null }) {
    return this.http.get<PagedResult<AppNotification>>(`${this.base}/notifications`, { params: toParams(q) });
  }
  unreadCount() { return this.http.get<{ count: number }>(`${this.base}/notifications/unread-count`).pipe(map(r => r.count)); }
  markNotificationRead(id: number) { return this.http.post<void>(`${this.base}/notifications/${id}/read`, {}); }
  markAllNotificationsRead() { return this.http.post<void>(`${this.base}/notifications/read-all`, {}); }
  deleteNotification(id: number) { return this.http.delete<void>(`${this.base}/notifications/${id}`); }

  // ---------- reports ----------
  attendanceReport(q: ReportQuery) { return this.http.get<AttendanceReport>(`${this.base}/reports/attendance`, { params: toParams(q) }); }
  absenceReport(q: ReportQuery) { return this.http.get<Absence[]>(`${this.base}/reports/absence`, { params: toParams(q) }); }
  taskReport(q: ReportQuery) { return this.http.get<TaskReport>(`${this.base}/reports/tasks`, { params: toParams(q) }); }
  performanceReport(q: ReportQuery) {
    return this.http.get<EmployeePerformance[]>(`${this.base}/reports/employee-performance`, { params: toParams(q) });
  }
  exportReport(kind: 'attendance' | 'absence' | 'tasks' | 'employee-performance', q: ReportQuery, format: ExportFormat) {
    return this.download(`${this.base}/reports/${kind}`, { ...q, format });
  }

  // ---------- audit ----------
  auditLogs(q: PageQuery & { entityName?: string | null; action?: string | null; from?: string | null; to?: string | null }) {
    return this.http.get<PagedResult<AuditLog>>(`${this.base}/audit-logs`, { params: toParams(q) });
  }

  // ---------- helpers ----------
  /** Downloads a file and triggers the browser "save as" using the server-provided file name. */
  download(url: string, query: object): Observable<void> {
    return this.http.get(url, { params: toParams(query), responseType: 'blob', observe: 'response' }).pipe(
      map((res: HttpResponse<Blob>) => {
        const disposition = res.headers.get('content-disposition') ?? '';
        const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition);
        const name = decodeURIComponent(match?.[1] ?? match?.[2] ?? 'download');
        const blobUrl = URL.createObjectURL(res.body!);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      }),
    );
  }
}
