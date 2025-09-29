import * as https from 'https';
import { Logger } from '../utils/logger';

interface MetricPoint {
  timestamp: number;
  value: number;
  labels: Record<string, string | undefined>;
}

interface GrafanaMetric {
  name: string;
  help: string;
  type: 'gauge' | 'counter' | 'histogram';
  points: MetricPoint[];
}

export class GrafanaMetrics {
  private static instance: GrafanaMetrics;
  private readonly logger = new Logger();
  private metrics: Map<string, MetricPoint[]> = new Map();
  private isEnabled = false;

  private constructor() {
    this.isEnabled = !!(
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT &&
      process.env.OTEL_EXPORTER_OTLP_HEADERS
    );

    if (this.isEnabled) {
      this.logger.info('Grafana Cloud metrics enabled');
      // Send metrics every 30 seconds
      setInterval(() => this.flush(), 30000);
    } else {
      this.logger.info('Grafana Cloud metrics disabled (missing OTEL environment variables)');
    }
  }

  public static getInstance(): GrafanaMetrics {
    if (!GrafanaMetrics.instance) {
      GrafanaMetrics.instance = new GrafanaMetrics();
    }
    return GrafanaMetrics.instance;
  }

  public recordGauge(name: string, value: number, labels: Record<string, string | undefined> = {}): void {
    if (!this.isEnabled) return;

    this.addMetric(name, value, labels);
  }

  public recordCounter(name: string, value: number = 1, labels: Record<string, string | undefined> = {}): void {
    if (!this.isEnabled) return;

    this.addMetric(name, value, labels);
  }

  public recordHistogram(name: string, value: number, labels: Record<string, string | undefined> = {}): void {
    if (!this.isEnabled) return;

    this.addMetric(name, value, labels);
  }

  private addMetric(name: string, value: number, labels: Record<string, string | undefined>): void {
    const timestamp = Date.now();
    const point: MetricPoint = { timestamp, value, labels };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    this.metrics.get(name)!.push(point);
  }

  public async flush(): Promise<void> {
    if (!this.isEnabled || this.metrics.size === 0) return;

    try {
      const payload = this.buildOTLPPayload();
      if (payload.resourceMetrics && payload.resourceMetrics[0]?.scopeMetrics?.[0]?.metrics?.length > 0) {
        await this.sendToGrafana(JSON.stringify(payload));
        this.metrics.clear();
      }
    } catch (error) {
      this.logger.warn(`Failed to send metrics to Grafana: ${(error as Error).message}`);
    }
  }

  private buildOTLPPayload(): any {
    const metrics: any[] = [];

    for (const [metricName, points] of this.metrics.entries()) {
      const metric = {
        name: metricName,
        description: `DevAgent metric: ${metricName}`,
        unit: this.getMetricUnit(metricName),
        gauge: {
          dataPoints: points.map(point => ({
            timeUnixNano: (point.timestamp * 1000000).toString(),
            asDouble: point.value,
            attributes: Object.entries(point.labels)
              .filter(([key, value]) => value !== undefined)
              .map(([key, value]) => ({ key, value: { stringValue: value } }))
          }))
        }
      };

      metrics.push(metric);
    }

    return {
      resourceMetrics: [{
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'devagent' } },
            { key: 'service.version', value: { stringValue: '1.0.0' } }
          ]
        },
        scopeMetrics: [{
          scope: { name: 'devagent', version: '1.0.0' },
          metrics: metrics
        }]
      }]
    };
  }

  private getMetricUnit(metricName: string): string {
    if (metricName.includes('cost')) return 'USD';
    if (metricName.includes('duration') || metricName.includes('time')) return 'ms';
    if (metricName.includes('tokens')) return '1';
    if (metricName.includes('rate')) return '1';
    return '1';
  }

  private async sendToGrafana(payload: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '';
      const headers = this.parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS || '');

      // Use the OTLP endpoint directly for metrics
      const url = new URL(endpoint.endsWith('/v1/metrics') ? endpoint : `${endpoint}/v1/metrics`);

      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      };

      const req = https.request(options, (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }
      });

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  private parseHeaders(headersString: string): Record<string, string> {
    const headers: Record<string, string> = {};
    if (!headersString) return headers;

    const pairs = headersString.split(',');
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key && value) {
        headers[key.trim()] = value.trim();
      }
    }
    return headers;
  }

  public async shutdown(): Promise<void> {
    await this.flush();
  }
}

// Export singleton
export const grafanaMetrics = GrafanaMetrics.getInstance();