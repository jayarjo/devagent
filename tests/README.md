# DevAgent Tests

This directory contains the test suite for DevAgent using Vitest.

## Structure

- `providers/` - Tests for AI provider implementations and factory
- `core/` - Tests for core functionality like cost tracking
- `utils/` - Tests for utility functions

## Running Tests

```bash
# Run tests in watch mode
bun run test

# Run tests once
bun run test:run

# Run tests with coverage
bun run test:coverage
```

## Test Categories

### Provider Tests (`providers/`)

- **ProviderFactory.test.ts**: Tests provider selection logic, priority ordering, and configuration
  - Provider priority: Claude > Gemini > OpenAI
  - Auto-detection based on API keys
  - Explicit provider selection via `AI_PROVIDER`
  - Provider availability validation

### Core Tests (`core/`)

- **CostTracker.test.ts**: Tests cost calculation and token usage tracking
  - Provider-specific pricing models
  - Cost comparison between providers
  - Token usage parsing from API responses

### Utility Tests (`utils/`)

- **tokenEstimation.test.ts**: Tests token estimation logic
  - 1 token ≈ 4 characters rule
  - Edge cases and large text handling

## Key Test Scenarios

### Provider Priority Order
Tests verify that the system follows the correct priority order:
1. Claude (ANTHROPIC_API_KEY) - Default, best quality
2. Gemini (GOOGLE_API_KEY) - Cost-effective
3. OpenAI (OPENAI_API_KEY) - Premium

### Cost Calculations
Tests verify accurate cost calculations per provider:
- **Claude**: $3/$15 per 1M tokens + $0.30/1M cached
- **Gemini**: $1.25/$5 per 1M tokens (65%+ savings vs Claude)
- **OpenAI**: $30/$60 per 1M tokens (93%+ more expensive than Gemini)

### Token Estimation
Tests verify the token estimation algorithm:
- 1 token ≈ 4 characters (using Math.ceil)
- Handles edge cases (null, undefined, empty strings)
- Accurate for code snippets and large text blocks

## Coverage

The test suite aims for high coverage of:
- Provider selection and fallback logic
- Cost calculation accuracy
- Token estimation precision
- Error handling and edge cases

Run `bun run test:coverage` to see detailed coverage reports.