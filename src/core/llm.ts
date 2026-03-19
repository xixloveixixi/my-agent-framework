/**
 * LLM 客户端 - 支持多种提供商，可通过继承扩展
 */
import { LLMConfig, Provider, MessageRole } from '../types';

// 消息格式接口
export interface MessageInput {
  role: MessageRole;
  content: string;
}

export class HelloAgentsLLM {
  protected config: LLMConfig;
  protected provider: Provider;

  constructor(config: Partial<LLMConfig> = {}) {
    // 自动检测 provider (可被子类重写)
    this.provider = this.autoDetectProvider(config);

    // 解析凭证 (可被子类重写)
    const { apiKey, baseURL } = this.resolveCredentials(config);

    this.config = {
      model: config.model || 'gpt-3.5-turbo',
      apiKey: apiKey || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY,
      baseURL: baseURL || process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens,
      timeout: config.timeout || 60000,
      provider: this.provider,
    };

    console.log(`🤖 LLM 初始化完成，Provider: ${this.provider}`);
  }

  /**
   * 自动检测 LLM 提供商 - 可被子类重写
   */
  protected autoDetectProvider(config: Partial<LLMConfig>): Provider {
    // 1. 优先检查用户指定的 provider
    if (config.provider && config.provider !== 'auto') {
      return config.provider;
    }

    // 2. 检查特定提供商的环境变量 (可被子类扩展)
    if (process.env.DEEPSEEK_API_KEY) return 'deepseek';
    if (process.env.MODELSCOPE_API_KEY) return 'modelscope';
    if (process.env.OPENAI_API_KEY) return 'openai';
    if (process.env.ANTHROPIC_API_KEY) return 'anthropic';

    // 3. 根据 baseURL 判断 (可被子类扩展)
    const baseURL = config.baseURL || process.env.LLM_BASE_URL || '';
    const baseURLLower = baseURL.toLowerCase();

    if (baseURLLower.includes('api.deepseek.com')) return 'deepseek';
    if (baseURLLower.includes('api-inference.modelscope.cn')) return 'modelscope';
    if (baseURLLower.includes('api.openai.com')) return 'openai';
    if (baseURLLower.includes('api.anthropic.com')) return 'anthropic';
    if (baseURLLower.includes(':11434')) return 'ollama';
    if (baseURLLower.includes(':8000')) return 'vllm';
    if (baseURLLower.includes('localhost') || baseURLLower.includes('127.0.0.1')) {
      return 'ollama'; // 默认本地服务为 ollama
    }

    return 'openai'; // 默认
  }

  /**
   * 解析凭证 - 可被子类重写
   */
  protected resolveCredentials(config: Partial<LLMConfig>): { apiKey?: string; baseURL?: string } {
    const baseURL = config.baseURL || process.env.LLM_BASE_URL;
    let apiKey = config.apiKey || process.env.LLM_API_KEY;

    // 根据 provider 设置默认值 (可被子类扩展)
    switch (this.provider) {
      case 'deepseek':
        apiKey = apiKey || process.env.DEEPSEEK_API_KEY;
        return {
          apiKey,
          baseURL: baseURL || 'https://api.deepseek.com/v1',
        };
      case 'modelscope':
        apiKey = apiKey || process.env.MODELSCOPE_API_KEY;
        return {
          apiKey,
          baseURL: baseURL || 'https://api-inference.modelscope.cn/v1/',
        };
      case 'anthropic':
        apiKey = apiKey || process.env.ANTHROPIC_API_KEY;
        return {
          apiKey,
          baseURL: baseURL || 'https://api.anthropic.com/v1/',
        };
      case 'ollama':
        return {
          apiKey: apiKey || 'ollama',
          baseURL: baseURL || 'http://localhost:11434/v1',
        };
      case 'vllm':
        return {
          apiKey: apiKey || 'vllm',
          baseURL: baseURL || 'http://localhost:8000/v1',
        };
      default:
        return {
          apiKey,
          baseURL: baseURL || 'https://api.openai.com/v1',
        };
    }
  }

  /**
   * 调用 LLM
   */
  async invoke(messages: MessageInput[], options: { temperature?: number; maxTokens?: number } = {}): Promise<string> {
    const url = `${this.config.baseURL}/chat/completions`;

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options.temperature ?? this.config.temperature,
      ...(options.maxTokens || this.config.maxTokens ? { max_tokens: options.maxTokens || this.config.maxTokens } : {}),
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.provider !== 'ollama' && this.provider !== 'vllm' && this.config.apiKey
            ? { Authorization: `Bearer ${this.config.apiKey}` }
            : {}),
          ...(this.provider === 'anthropic' && this.config.apiKey
            ? { 'x-api-key': this.config.apiKey, 'anthropic-version': '2023-06-01' }
            : {}),
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`LLM API Error: ${response.status} - ${error}`);
      }

      const data = await response.json() as Record<string, unknown>;
      return (data.choices as Array<{ message?: { content?: string } }>)?.[0]?.message?.content || '';
    } catch (error) {
      throw new Error(`LLM 调用失败: ${(error as Error).message}`);
    }
  }

  /**
   * 流式调用 LLM
   */
  async *stream(messages: MessageInput[], options: { temperature?: number; maxTokens?: number } = {}): AsyncGenerator<string> {
    const url = `${this.config.baseURL}/chat/completions`;

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options.temperature ?? this.config.temperature,
      stream: true,
      ...(options.maxTokens || this.config.maxTokens ? { max_tokens: options.maxTokens || this.config.maxTokens } : {}),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.provider !== 'ollama' && this.provider !== 'vllm' && this.config.apiKey
          ? { Authorization: `Bearer ${this.config.apiKey}` }
          : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`LLM API Error: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content;
            if (content) yield content;
          } catch {
            // 忽略解析错误
          }
        }
      }
    }
  }

  getProvider(): Provider {
    return this.provider;
  }

  getModel(): string {
    return this.config.model;
  }
}
