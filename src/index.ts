#!/usr/bin/env node

import { DevAgent } from './core/DevAgent';
import { DevAgentMode } from './types';
import { CostTracker } from './telemetry/costTracker';

async function main(): Promise<void> {
  try {
    // Check for CLI arguments
    const args = process.argv.slice(2);
    const mode = args.includes('--update-cache-mode') ? DevAgentMode.CACHE_UPDATE : DevAgentMode.FIX;

    console.log(`Starting DevAgent in ${mode} mode`);

    // Create and run the agent
    const agent = new DevAgent(mode);
    await agent.run();

    console.log('DevAgent completed successfully');
  } catch (error) {
    console.error('Fatal error:', (error as Error).message);
    console.error('Stack trace:', (error as Error).stack);
    process.exit(1);
  } finally {
    // Flush any remaining metrics
    await CostTracker.shutdown();
  }
}

// Handle process signals for graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  await CostTracker.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await CostTracker.shutdown();
  process.exit(0);
});

// Run if this is the main module
if (require.main === module) {
  main().catch(async (error) => {
    console.error('Fatal error:', (error as Error).message);
    console.error('Stack trace:', (error as Error).stack);
    await CostTracker.shutdown();
    process.exit(1);
  });
}

export { DevAgent } from './core/DevAgent';
export * from './types';