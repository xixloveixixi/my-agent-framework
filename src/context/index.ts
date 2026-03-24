/**
 * Context Engineering - 上下文工程模块
 * 提供智能体上下文构建的核心功能
 */

export * from './types.js';
export * from './builder.js';

// Re-export for convenience
export { ContextBuilder, buildContext, mergeContextResults } from './builder.js';
export type { ContextBuildResult, GatherParams, ContextTool } from './builder.js';
export type { ContextPacket, ContextConfig } from './types.js';