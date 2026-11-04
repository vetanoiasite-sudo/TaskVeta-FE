import { Routes } from '@angular/router';
import { authGuard, guestGuard, permissionGuard } from './core/http';
import { Perm } from './core/models';
import { ShellComponent } from './layout/shell';

export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./features/auth/login').then(m => m.LoginComponent) },
  {
    // Full-screen QR display for the entrance screen.
    path: 'kiosk',
    canActivate: [authGuard, permissionGuard],
    data: { permissions: [Perm.AttendanceKiosk] },
    loadComponent: () => import('./features/attendance/kiosk').then(m => m.KioskComponent),
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./features/dashboard/dashboard').then(m => m.DashboardComponent) },
      { path: 'notifications', loadComponent: () => import('./features/notifications/notifications').then(m => m.NotificationsComponent) },
      { path: 'attendance', loadChildren: () => import('./features/attendance/attendance.routes').then(m => m.ATTENDANCE_ROUTES) },
      { path: 'tasks', loadChildren: () => import('./features/tasks/tasks.routes').then(m => m.TASK_ROUTES) },
      { path: 'admin', loadChildren: () => import('./features/admin/admin.routes').then(m => m.ADMIN_ROUTES) },
    ],
  },
  { path: '**', redirectTo: '' },
];
