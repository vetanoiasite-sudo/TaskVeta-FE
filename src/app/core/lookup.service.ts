import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import { ApiService } from './api.service';
import { Lookup, WorkSchedule } from './models';

/** Cached dropdown data (scoped by the server to what the current user may see). Call `invalidate()` after edits. */
@Injectable({ providedIn: 'root' })
export class LookupService {
  private readonly api = inject(ApiService);
  private departments$?: Observable<Lookup[]>;
  private employees$?: Observable<Lookup[]>;
  private schedules$?: Observable<WorkSchedule[]>;
  private readonly teams = new Map<string, Observable<Lookup[]>>();

  departments(): Observable<Lookup[]> {
    return (this.departments$ ??= this.api.departmentLookup().pipe(shareReplay(1)));
  }

  employees(): Observable<Lookup[]> {
    return (this.employees$ ??= this.api.employeeLookup().pipe(shareReplay(1)));
  }

  teamsFor(departmentId?: number | null): Observable<Lookup[]> {
    const key = String(departmentId ?? 'all');
    if (!this.teams.has(key)) this.teams.set(key, this.api.teamLookup(departmentId).pipe(shareReplay(1)));
    return this.teams.get(key)!;
  }

  workSchedules(): Observable<WorkSchedule[]> {
    return (this.schedules$ ??= this.api.workSchedules().pipe(shareReplay(1)));
  }

  invalidate(): void {
    this.departments$ = this.employees$ = this.schedules$ = undefined;
    this.teams.clear();
  }
}
