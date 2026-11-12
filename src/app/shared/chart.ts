import { Component, ElementRef, OnDestroy, afterRenderEffect, inject, input, viewChild } from '@angular/core';
import { Chart, ChartConfiguration, ChartType, registerables } from 'chart.js';
import { I18nService } from '../core/i18n.service';

Chart.register(...registerables);

// ---------------------------------------------------------------- chart (Chart.js wrapper)

const PALETTE = ['#1877f2', '#31a24c', '#f7b928', '#e41e3f', '#7b4fd6', '#0a7cbd', '#f3425f', '#65676b'];

@Component({
  selector: 'app-chart',
  template: `<div class="chart-box" [style.height.px]="height()"><canvas #canvas></canvas></div>`,
})
export class ChartComponent implements OnDestroy {
  readonly type = input<ChartType>('bar');
  readonly labels = input<string[]>([]);
  readonly datasets = input<{ label: string; data: number[]; color?: string; fill?: boolean; stack?: string }[]>([]);
  readonly height = input(280);
  readonly stacked = input(false);
  readonly horizontal = input(false);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly i18n = inject(I18nService);
  private chart?: Chart;

  constructor() {
    afterRenderEffect(() => {
      const type = this.type();
      const rtl = this.i18n.dir() === 'rtl';
      const isCircular = type === 'doughnut' || type === 'pie';
      const datasets = this.datasets().map((d, i) => {
        const color = d.color ?? PALETTE[i % PALETTE.length];
        return {
          label: d.label, data: d.data, stack: d.stack,
          backgroundColor: isCircular ? d.data.map((_, j) => PALETTE[j % PALETTE.length]) : type === 'line' ? color + '33' : color,
          borderColor: isCircular ? '#fff' : color, borderWidth: isCircular ? 2 : type === 'line' ? 2 : 0,
          borderRadius: type === 'bar' ? 6 : 0, fill: d.fill ?? false, tension: 0.35, pointRadius: type === 'line' ? 3 : 0,
          maxBarThickness: 36,
        };
      });
      const config: ChartConfiguration = {
        type,
        data: { labels: this.labels(), datasets: datasets as never },
        options: {
          responsive: true, maintainAspectRatio: false, indexAxis: this.horizontal() ? 'y' : 'x',
          locale: this.i18n.locale(),
          plugins: {
            legend: { position: 'bottom', rtl, labels: { usePointStyle: true, boxWidth: 8, font: { family: 'inherit' } } },
            tooltip: { rtl, mode: isCircular ? 'nearest' : 'index', intersect: false },
          },
          scales: isCircular ? {} : {
            x: { stacked: this.stacked(), reverse: rtl, beginAtZero: true, grid: { display: this.horizontal() }, ticks: { precision: 0 } },
            y: { stacked: this.stacked(), beginAtZero: true, position: rtl ? 'right' : 'left', grid: { display: !this.horizontal() }, ticks: { precision: 0 } },
          },
        },
      };
      this.chart?.destroy();
      this.chart = new Chart(this.canvas().nativeElement, config);
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }
}

