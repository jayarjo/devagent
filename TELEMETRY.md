# DevAgent OpenTelemetry Integration

This document describes the OpenTelemetry integration for DevAgent, providing comprehensive monitoring and cost tracking capabilities.

## Overview

DevAgent now includes built-in telemetry that tracks:
- **Claude API costs and token usage**
- **Execution performance metrics**
- **Cache hit rates and effectiveness**
- **Error rates and rate limiting events**
- **Repository-specific usage patterns**

All metrics are exported to Grafana Cloud via OpenTelemetry Protocol (OTLP).

## Setup Instructions

### 1. Grafana Cloud Configuration

1. Sign up for [Grafana Cloud](https://grafana.com/products/cloud/) if you haven't already
2. Navigate to your Grafana Cloud instance
3. Go to **Connections → Data Sources → Prometheus**
4. Copy the **Remote Write Endpoint** and **Username/Password**

### 2. Environment Variables

Add these secrets to your GitHub repository:

#### Required for Telemetry:
```bash
OTEL_EXPORTER_OTLP_ENDPOINT="https://otlp-gateway-prod-us-west-0.grafana.net/otlp"
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Basic <YOUR_BASE64_ENCODED_CREDENTIALS>"
```

#### How to generate OTLP headers:
1. Get your Grafana Cloud credentials (Instance ID and API Token)
2. Encode them as base64: `echo -n "instance_id:api_token" | base64`
3. Use the result in the headers: `Authorization=Basic <base64_encoded_credentials>`

### 3. GitHub Secrets Setup

In your GitHub repository:
1. Go to **Settings → Secrets and variables → Actions**
2. Add these repository secrets:
   - `OTEL_EXPORTER_OTLP_ENDPOINT`
   - `OTEL_EXPORTER_OTLP_HEADERS`
   - `ANTHROPIC_API_KEY` (existing)

## Metrics Tracked

### 1. Cost Metrics
- **`devagent_cost_usd`** - Cost per Claude API request (histogram)
- **`devagent_tokens_total`** - Token usage by type (input/output/cached)
- Cost breakdown by repository and execution mode

### 2. Performance Metrics
- **`devagent_request_duration_ms`** - Claude API request duration
- **`devagent_execution_duration_ms`** - Total execution time by operation
- **`devagent_operations_total`** - Success/failure counts

### 3. Cache Metrics
- **`devagent_cache_hit_rate`** - Cache effectiveness (0-1 ratio)
- Repository structure cache hits
- File summary cache utilization

### 4. Error Tracking
- **`devagent_errors_total`** - Error counts by type
- **`devagent_rate_limits_total`** - Rate limiting events
- Error classification and repository attribution

## Tracing

DevAgent creates distributed traces for:
- **`devagent.fix`** - Full issue-fixing workflow
- **`devagent.cache-update`** - Cache update operations
- **`claude.request`** - Individual Claude API calls

Each trace includes:
- Duration and status
- Token counts and costs
- Repository and issue context
- Error details and stack traces

## Grafana Dashboard

Import the pre-built dashboard from `grafana-dashboards/devagent-metrics.json`:

### Key Panels:
1. **Cost Overview** - Daily API costs and token usage
2. **Performance** - Execution times and success rates
3. **Cache Effectiveness** - Hit rates and savings
4. **Error Monitoring** - Failure rates and rate limits
5. **Repository Analysis** - Usage patterns by repo

### Alerts Setup

Recommended alerts:
- High API costs (>$1 per day)
- Low cache hit rate (<80%)
- High error rate (>5%)
- Rate limiting events

## Cost Analysis

### Token Pricing (as of 2024):
- **Input tokens**: $3.00 per 1M tokens
- **Output tokens**: $15.00 per 1M tokens
- **Cached input**: $0.30 per 1M tokens (90% savings!)

### Example Queries:

**Daily cost by repository:**
```promql
sum by (repository) (increase(devagent_cost_usd[1d]))
```

**Cache savings calculation:**
```promql
(
  sum(increase(devagent_tokens_total{token_type="input"}[1d])) * 3.0 -
  sum(increase(devagent_tokens_total{token_type="cached"}[1d])) * 0.3
) / 1000000
```

**Success rate by mode:**
```promql
sum(rate(devagent_operations_total{success="true"}[5m])) by (mode) /
sum(rate(devagent_operations_total[5m])) by (mode) * 100
```

## Troubleshooting

### Telemetry Not Working

1. **Check environment variables:**
   ```bash
   echo $OTEL_EXPORTER_OTLP_ENDPOINT
   echo $OTEL_EXPORTER_OTLP_HEADERS
   ```

2. **Verify credentials:**
   - Ensure base64 encoding is correct
   - Check Grafana Cloud instance ID and API token

3. **Check logs:**
   - Look for "OpenTelemetry initialized successfully"
   - Error messages will indicate authentication issues

### Missing Metrics

1. **Token parsing issues:**
   - DevAgent estimates tokens if Claude doesn't provide actual counts
   - Check Claude CLI response format

2. **Network issues:**
   - OTLP endpoint must be accessible from GitHub Actions
   - Firewall rules may block telemetry export

### Performance Impact

- Telemetry adds ~10-50ms overhead per operation
- Metrics are batched and exported asynchronously
- Memory usage increases by ~5-10MB for telemetry buffer

## Development

### Adding Custom Metrics

```typescript
import { tokenMetrics } from '../telemetry/metrics/TokenMetrics';

// Record custom operation
tokenMetrics.recordExecution('custom_operation', durationMs, success, {
  repository: 'my-repo',
  customLabel: 'value'
});
```

### Creating Spans

```typescript
import { getTracer } from '../telemetry/tracer';

const tracer = getTracer();
const span = tracer.startSpan('my.operation');
span.setAttributes({ 'custom.attribute': 'value' });
// ... do work ...
span.end();
```

## Security Considerations

- **API tokens** are stored as GitHub secrets
- **Telemetry data** includes repository names but no source code
- **Grafana Cloud** provides SOC 2 compliance
- **Network traffic** is encrypted via HTTPS/TLS

---

For questions or issues with telemetry setup, check the GitHub Actions logs or create an issue in the repository.