#!/usr/bin/env node

import { DevAgent } from './core/DevAgent';
import { DevAgentMode } from './types';

async function main(): Promise<void> {
  try {
    // Check for CLI arguments
    const args = process.argv.slice(2);
    const mode = args.includes('--update-cache-mode') ? DevAgentMode.CACHE_UPDATE : DevAgentMode.FIX;

    // Create and run the agent
    const agent = new DevAgent(mode);
    await agent.run();
  } catch (error) {
    console.error('Fatal error:', (error as Error).message);
    console.error('Stack trace:', (error as Error).stack);
    process.exit(1);
  }
}

// Run if this is the main module
if (require.main === module) {
  main();
}

export { DevAgent } from './core/DevAgent';
export * from './types';