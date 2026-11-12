import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/http';
import { Perm } from '../../core/models';

export const TASK_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [permissionGuard],
    data: { permissions: [Perm.TasksAssign], mode: 'all' },
    loadComponent: () => import('./task-list').then(m => m.TaskListComponent),
  },
  { path: 'my', data: { mode: 'my' }, loadComponent: () => import('./task-list').then(m => m.TaskListComponent) },
  { path: 'board', loadComponent: () => import('./task-board').then(m => m.TaskBoardComponent) },
  {
    path: 'reviews', canActivate: [permissionGuard], data: { permissions: [Perm.TaskReviewsView] },
    loadComponent: () => import('./task-reviews-report').then(m => m.TaskReviewsReportComponent),
  },
  { path: ':id', loadComponent: () => import('./task-details').then(m => m.TaskDetailsComponent) },
];
