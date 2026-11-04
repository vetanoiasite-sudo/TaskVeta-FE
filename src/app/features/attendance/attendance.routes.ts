import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/http';
import { Perm } from '../../core/models';

export const ATTENDANCE_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'my' },
  {
    path: 'my', canActivate: [permissionGuard], data: { permissions: [Perm.AttendanceSelf] },
    loadComponent: () => import('./my-attendance').then(m => m.MyAttendanceComponent),
  },
  {
    path: 'scan', canActivate: [permissionGuard], data: { permissions: [Perm.AttendanceSelf] },
    loadComponent: () => import('./scan').then(m => m.ScanComponent),
  },
  {
    path: 'daily', canActivate: [permissionGuard], data: { permissions: [Perm.AttendanceViewTeam] },
    loadComponent: () => import('./daily').then(m => m.DailyAttendanceComponent),
  },
  {
    path: 'history', canActivate: [permissionGuard], data: { permissions: [Perm.AttendanceViewTeam] },
    loadComponent: () => import('./history').then(m => m.AttendanceHistoryComponent),
  },
  {
    path: 'absences', canActivate: [permissionGuard], data: { permissions: [Perm.AttendanceViewTeam] },
    loadComponent: () => import('./absences').then(m => m.AbsencesComponent),
  },
  {
    path: 'analytics', canActivate: [permissionGuard], data: { permissions: [Perm.ReportsView] },
    loadComponent: () => import('./analytics').then(m => m.AnalyticsComponent),
  },
  { path: 'leave', loadComponent: () => import('./leave').then(m => m.LeaveComponent) },
];
