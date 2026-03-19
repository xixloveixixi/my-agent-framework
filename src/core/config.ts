/**
 * Config 配置管理类
 */
import { LLMConfig } from '../types';

export class Config {
  // LLM 配置
  defaultModel: string;
  defaultProvider: string;
  temperature: number;
  maxTokens?: number;

  // 系统配置
  debug: boolean;
  logLevel: string;

  // 其他配置
  maxHistoryLength: number;

  constructor() {
    this.defaultModel = process.env.LLM_MODEL || process.env.LLM_MODEL_ID || 'gpt-3.5-turbo';
    this.defaultProvider = process.env.LLM_PROVIDER || 'openai';
    this.temperature = parseFloat(process.env.TEMPERATURE || '0.7');
    this.maxTokens = process.env.MAX_TOKENS ? parseInt(process.env.MAX_TOKENS) : undefined;

    this.debug = process.env.DEBUG?.toLowerCase() === 'true';
    this.logLevel = process.env.LOG_LEVEL || 'INFO';

    this.maxHistoryLength = parseInt(process.env.MAX_HISTORY_LENGTH || '100');
  }

  static fromEnv(): Config {
    return new Config();
  }

  toDict(): Record<string, unknown> {
    return {
      defaultModel: this.defaultModel,
      defaultProvider: this.defaultProvider,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      debug: this.debug,
      logLevel: this.logLevel,
      maxHistoryLength: this.maxHistoryLength,
    };
  }

  getLLMConfig(): Partial<LLMConfig> {
    return {
      model: this.defaultModel,
      provider: this.defaultProvider as LLMConfig['provider'],
      temperature: this.temperature,
      maxTokens: this.maxTokens,
    };
  }
}
