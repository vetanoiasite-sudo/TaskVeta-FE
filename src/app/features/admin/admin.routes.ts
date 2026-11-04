import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/http';
import { Perm } from '../../core/models';

export const ADMIN_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'employees' },
  {
    path: 'employees', canActivate: [permissionGuard], data: { permissions: [Perm.EmployeesView] },
    loadComponent: () => import('./employees').then(m => m.EmployeesComponent),
  },
  {
    path: 'departments', canActivate: [permissionGuard], data: { permissions: [Perm.EmployeesView] },
    loadComponent: () => import('./departments').then(m => m.DepartmentsComponent),
  },
  {
    path: 'teams', canActivate: [permissionGuard], data: { permissions: [Perm.EmployeesView] },
    loadComponent: () => import('./teams').then(m => m.TeamsComponent),
  },
  {
    path: 'users', canActivate: [permissionGuard], data: { permissions: [Perm.UsersManage] },
    loadComponent: () => import('./users').then(m => m.UsersComponent),
  },
  {
    path: 'settings', canActivate: [permissionGuard], data: { permissions: [Perm.SettingsManage, Perm.HolidaysManage] },
    loadComponent: () => import('./settings').then(m => m.SettingsComponent),
  },
  {
    path: 'audit', canActivate: [permissionGuard], data: { permissions: [Perm.AuditView] },
    loadComponent: () => import('./audit').then(m => m.AuditComponent),
  },
];
