/**
 * HelloAgents TypeScript Framework
 * 主入口文件
 */

// Core 模块
export { HelloAgentsLLM } from './core/llm';
export { Message } from './core/message';
export { Config } from './core/config';
export { Agent } from './core/agent';

// Agents 模块
export { SimpleAgent } from './agents/simple-agent';
export { ReActAgent } from './agents/react-agent';
export { PlanAndSolveAgent } from './agents/plan-solve-agent';
export { ReflectionAgent } from './agents/reflection-agent';
export { ContextAwareAgent } from './agents/context-aware-agent';
export type { ContextAwareAgentConfig } from './agents/context-aware-agent';

// Tools 模块
export { BaseTool } from './tools/base';
export { ToolRegistry } from './tools/registry';
export { CalculatorTool } from './tools/calculator';
export { SearchTool } from './tools/search';
export { MemoryTool, LongTermMemoryTool } from './tools/memory-tool';
export { RAGTool, RAGQATool } from './tools/rag-tool';
export { NoteTool } from './tools/note-tool';
export type { NoteMetadata, NoteType, NoteResult } from './tools/note-tool';
export { TerminalTool } from './tools/terminal-tool';
export type { TerminalToolOptions } from './tools/terminal-tool';
export { MCPTool, createMCPTool, listBuiltinServers } from './tools/mcp-tool';

// Memory 模块
export * from './memory';

// Context 模块
export * from './context';

// Types
export * from './types';

// MCP 模块
export * from './mcp';
