/**
 * 自定义 LLM 示例：如何通过继承扩展新的 LLM 提供商
 *
 * 这个示例展示如何添加 Qwen (阿里云) 支持
 */
import { HelloAgentsLLM } from '../core/llm';
import { LLMConfig } from '../types';

/**
 * 自定义 Qwen LLM 客户端
 * 通过继承 HelloAgentsLLM 来扩展新的提供商
 */
class MyQwenLLM extends HelloAgentsLLM {
  constructor(config: Partial<LLMConfig> = {}) {
    // 检查是否是 qwen (使用类型断言绕过类型检查)
    if (config.provider === 'qwen' || (config.provider as string) === 'tongyi') {
      console.log('🐫 使用自定义 Qwen Provider');

      // 传入自定义配置，让父类处理
      super({
        ...config,
        // 覆盖 baseURL 为 Qwen 的 API 地址
        baseURL: config.baseURL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        // Qwen 模型名
        model: config.model || 'qwen-turbo',
      });
    } else {
      // 其他情况交给父类处理
      super(config);
    }
  }
}

/**
 * 更高级的扩展方式：完全重写 autoDetectProvider
 *
 * 如果你想让框架自动检测到 Qwen，可以这样：
 */
class MyAutoDetectLLM extends HelloAgentsLLM {
  /**
   * 重写自动检测方法
   */
  protected autoDetectProvider(config: Partial<LLMConfig>): import('../types').Provider {
    // 1. 首先调用父类的检测逻辑
    const parentProvider = super.autoDetectProvider(config);

    // 2. 检查额外的环境变量 (Qwen)
    if (process.env.QWEN_API_KEY) {
      return 'qwen';
    }

    // 3. 检查 baseURL 中的特征
    const baseURL = config.baseURL || process.env.LLM_BASE_URL || '';
    if (baseURL.includes('dashscope.aliyuncs.com')) {
      return 'qwen';
    }

    return parentProvider;
  }

  /**
   * 重写凭证解析方法
   */
  protected resolveCredentials(config: Partial<LLMConfig>): { apiKey?: string; baseURL?: string } {
    // 检查是否是 Qwen
    const baseURL = config.baseURL || process.env.LLM_BASE_URL || '';
    const isQwen = config.provider === 'qwen' || baseURL.includes('dashscope');

    if (isQwen) {
      const apiKey = config.apiKey || process.env.QWEN_API_KEY || process.env.LLM_API_KEY;
      return {
        apiKey,
        baseURL: baseURL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      };
    }

    // 其他情况交给父类
    return super.resolveCredentials(config);
  }
}

// ==================== 使用示例 ====================

// 方式1: 手动指定 provider
console.log('\n--- 方式1: 手动指定 ---');
const qwen1 = new MyQwenLLM({
  provider: 'qwen',
  model: 'qwen-plus',
  apiKey: 'your-qwen-api-key'
});
console.log(`Provider: ${qwen1.getProvider()}`);
console.log(`Model: ${qwen1.getModel()}`);

// 方式2: 自动检测 (需要设置环境变量)
// export QWEN_API_KEY=your-key
console.log('\n--- 方式2: 自动检测 ---');
const qwen2 = new MyAutoDetectLLM({
  // 如果设置了 QWEN_API_KEY 环境变量，会自动检测
});
console.log(`Provider: ${qwen2.getProvider()}`);

export { MyQwenLLM, MyAutoDetectLLM };
