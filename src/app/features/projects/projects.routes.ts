import { Routes } from '@angular/router';

export const PROJECT_ROUTES: Routes = [
  { path: '', pathMatch: 'full', loadComponent: () => import('./projects').then(m => m.ProjectsComponent) },
  { path: ':id', loadComponent: () => import('./project-timeline').then(m => m.ProjectTimelineComponent) },
];
