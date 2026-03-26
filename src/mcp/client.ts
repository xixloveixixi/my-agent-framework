/**
 * MCP (Model Context Protocol) 客户端实现
 * 支持 stdio 模式连接 - 通过子进程与 MCP 服务器通信
 * 基于 FastMCP 2.0 协议
 */
import { spawn, ChildProcess } from 'child_process';
import { MCPTool, MCPResource, MCPPrompt, MCPResponse, MCPInitializeResult } from './types';

export interface MCPClientConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export class MCPClient {
  private process: ChildProcess | null = null;
  private initialized = false;
  private requestId = 0;
  private messageBuffer = '';  // 消息缓冲区，处理不完整的 JSON 消息
  private pendingRequests: Map<number, {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
  }> = new Map();
  private capabilities: MCPInitializeResult['capabilities'] = {};
  private serverInfo: MCPInitializeResult['serverInfo'] = { name: '', version: '' };

  constructor(private config: MCPClientConfig) {}

  /**
   * 连接到 MCP 服务器并初始化
   */
  async connect(): Promise<void> {
    if (this.initialized) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        // 启动子进程
        this.process = spawn(this.config.command, this.config.args || [], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, ...this.config.env },
        });

        // 处理 stdout - 读取 JSON-RPC 响应
        this.process.stdout?.on('data', (data: Buffer) => {
          this.handleMessage(data.toString());
        });

        // 处理 stderr - 日志输出
        this.process.stderr?.on('data', (data: Buffer) => {
          const msg = data.toString().trim();
          if (msg) {
            console.log(`[MCP Server]: ${msg}`);
          }
        });

        // 处理进程错误
        this.process.on('error', (error) => {
          reject(new Error(`MCP 进程启动失败: ${error.message}`));
        });

        // 处理进程退出
        this.process.on('exit', (code) => {
          if (code !== 0 && code !== null) {
            console.warn(`MCP 进程退出，退出码: ${code}`);
          }
          this.initialized = false;
        });

        // 初始化 MCP 协议
        this.sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'hello-agents',
            version: '1.0.0',
          },
        })
          .then((result) => {
            const initResult = result as MCPInitializeResult;
            this.capabilities = initResult.capabilities;
            this.serverInfo = initResult.serverInfo;
            this.initialized = true;

            // 发送初始化通知
            this.sendNotification('initialized', {});

            console.log(`✅ 已连接到 MCP 服务器: ${this.serverInfo.name} v${this.serverInfo.version}`);
            resolve();
          })
          .catch(reject);

        // 设置超时
        setTimeout(() => {
          if (!this.initialized) {
            reject(new Error('MCP 连接超时'));
          }
        }, 30000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.initialized = false;
    this.pendingRequests.clear();
  }

  /**
   * 异步上下文管理器支持
   */
  async [Symbol.asyncDispose](): Promise<void> {
    this.disconnect();
  }

  /**
   * 列出所有可用工具
   */
  async listTools(): Promise<MCPTool[]> {
    if (!this.initialized) {
      throw new Error('MCP 客户端未初始化，请先调用 connect()');
    }

    const result = await this.sendRequest('tools/list', {});
    return (result as { tools: MCPTool[] }).tools || [];
  }

  /**
   * 调用工具
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.initialized) {
      throw new Error('MCP 客户端未初始化，请先调用 connect()');
    }

    const result = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });

    const response = result as MCPResponse;

    // 解析响应内容
    if (response.isError) {
      const errorText = response.content
        .map((c) => c.text || '')
        .join('\n');
      throw new Error(`MCP 工具调用错误: ${errorText}`);
    }

    // 合并所有文本内容
    return response.content
      .map((c) => c.text || '')
      .join('\n');
  }

  /**
   * 列出所有可用资源
   */
  async listResources(): Promise<MCPResource[]> {
    if (!this.initialized) {
      throw new Error('MCP 客户端未初始化，请先调用 connect()');
    }

    const result = await this.sendRequest('resources/list', {});
    return (result as { resources: MCPResource[] }).resources || [];
  }

  /**
   * 读取资源内容
   */
  async readResource(uri: string): Promise<string> {
    if (!this.initialized) {
      throw new Error('MCP 客户端未初始化，请先调用 connect()');
    }

    const result = await this.sendRequest('resources/read', { uri });
    const response = result as MCPResponse;

    // 解析资源内容
    const contents = response.content
      .filter((c) => c.type === 'resource')
      .map((c) => c.resource?.text || '');

    return contents.join('\n');
  }

  /**
   * 列出所有可用提示模板
   */
  async listPrompts(): Promise<MCPPrompt[]> {
    if (!this.initialized) {
      throw new Error('MCP 客户端未初始化，请先调用 connect()');
    }

    const result = await this.sendRequest('prompts/list', {});
    return (result as { prompts: MCPPrompt[] }).prompts || [];
  }

  /**
   * 获取提示模板
   */
  async getPrompt(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.initialized) {
      throw new Error('MCP 客户端未初始化，请先调用 connect()');
    }

    const result = await this.sendRequest('prompts/get', {
      name,
      arguments: args,
    });

    const response = result as MCPResponse;

    // 解析提示内容
    return response.content
      .map((c) => c.text || '')
      .join('\n');
  }

  /**
   * 获取服务器信息
   */
  getServerInfo(): MCPInitializeResult['serverInfo'] {
    return this.serverInfo;
  }

  /**
   * 获取服务器能力
   */
  getCapabilities(): MCPInitializeResult['capabilities'] {
    return this.capabilities;
  }

  /**
   * 发送 JSON-RPC 请求
   */
  private sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });

      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      const requestStr = JSON.stringify(request) + '\n';
      this.process?.stdin?.write(requestStr);

      // 设置超时
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`MCP 请求超时: ${method}`));
        }
      }, 60000);
    });
  }

  /**
   * 发送 JSON-RPC 通知（不需要响应）
   */
  private sendNotification(method: string, params: Record<string, unknown>): void {
    const notification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const notificationStr = JSON.stringify(notification) + '\n';
    this.process?.stdin?.write(notificationStr);
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(data: string): void {
    // 追加到缓冲区，处理不完整的消息
    this.messageBuffer += data;

    // 按行分割，处理多个响应
    const lines = this.messageBuffer.split('\n');

    // 处理所有完整的行
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (line) {
        this.processLine(line);
      }
    }

    // 保存最后一行（可能是未完成的消息）
    const lastLine = lines[lines.length - 1].trim();
    this.messageBuffer = lastLine ? lastLine : '';
  }

  /**
   * 处理单行 JSON-RPC 消息
   */
  private processLine(line: string): void {
    try {
      const response = JSON.parse(line);

      // 处理响应
      if ('id' in response && typeof response.id === 'number') {
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          this.pendingRequests.delete(response.id);
          if ('error' in response) {
            pending.reject(new Error(response.error.message || 'MCP 错误'));
          } else {
            pending.resolve(response.result);
          }
        }
      }

      // 处理通知（暂不处理）
    } catch (error) {
      // 忽略非 JSON 行
    }
  }
}

/**
 * 异步上下文管理器包装
 */
export async function createMCPClient(config: MCPClientConfig): Promise<MCPClient> {
  const client = new MCPClient(config);
  await client.connect();
  return client;
}