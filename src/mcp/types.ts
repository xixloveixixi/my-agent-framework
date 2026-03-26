/**
 * MCP (Model Context Protocol) 类型定义
 * 基于 FastMCP 2.0 协议
 */

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: MCPTool[];
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPResponse {
  content: Array<{
    type: string;
    text?: string;
    resource?: {
      uri: string;
      text?: string;
      blob?: string;
    };
  }>;
  isError?: boolean;
}

export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: {
    tools?: Record<string, unknown>;
    resources?: Record<string, unknown>;
    prompts?: Record<string, unknown>;
  };
  serverInfo: {
    name: string;
    version: string;
  };
}

export type MCPConnectionType = 'stdio' | 'sse' | 'http';