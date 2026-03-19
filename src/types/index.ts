/**
 * HelloAgents TypeScript Framework
 * 核心类型定义
 */

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface Message {
  content: string;
  role: MessageRole;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
}

export interface LLMConfig {
  model: string;
  apiKey?: string;
  baseURL?: string;
  provider?: Provider;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

export interface Tool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  execute: (params: Record<string, unknown>) => Promise<string>;
}

export interface AgentConfig {
  name?: string;
  systemPrompt?: string;
  maxIterations?: number;
  verbose?: boolean;
}

export interface ToolCall {
  toolName: string;
  parameters: Record<string, unknown>;
  original: string;
}

export type Provider = 'openai' | 'anthropic' | 'ollama' | 'vllm' | 'modelscope' | 'deepseek' | 'qwen' | 'auto';
