/**
 * Search Tool - 多源搜索工具
 * 支持 Tavily 和 SerpApi 两种搜索源
 */
import { BaseTool, ToolParameter } from './base';

type SearchBackend = 'hybrid' | 'tavily' | 'serpapi';

interface SearchResult {
  title: string;
  content: string;
  url: string;
}

export class SearchTool extends BaseTool {
  name = 'search';
  description = '智能网页搜索引擎，支持混合搜索模式，自动选择最佳搜索源';
  private backend: SearchBackend;
  private tavilyKey?: string;
  private serpapiKey?: string;
  private availableBackends: string[] = [];

  constructor(backend: SearchBackend = 'hybrid') {
    super();
    this.backend = backend;
    this.tavilyKey = process.env.TAVILY_API_KEY;
    this.serpapiKey = process.env.SERPAPI_API_KEY;
    this.setupBackends();
  }

  /**
   * 设置可用的搜索源
   */
  private setupBackends(): void {
    // 检查 Tavily
    if (this.tavilyKey) {
      this.availableBackends.push('tavily');
      console.log('✅ Tavily 搜索源已启用');
    }

    // 检查 SerpApi
    if (this.serpapiKey) {
      this.availableBackends.push('serpapi');
      console.log('✅ SerpApi 搜索源已启用');
    }

    if (this.availableBackends.length > 0) {
      console.log(`🔧 可用搜索源: ${this.availableBackends.join(', ')}`);
    } else {
      console.log('⚠️ 没有可用的搜索源，将使用模拟搜索结果');
    }
  }

  /**
   * 获取参数定义
   */
  getParameters(): ToolParameter[] {
    return [
      {
        name: 'query',
        type: 'string',
        description: '搜索关键词',
        required: true,
      },
      {
        name: 'maxResults',
        type: 'number',
        description: '最大结果数，默认 3',
        required: false,
        default: 3,
      },
    ];
  }

  /**
   * 执行搜索
   */
  async execute(params: Record<string, unknown>): Promise<string> {
    const query = params.query as string;
    const maxResults = (params.maxResults as number) || 3;

    if (!query.trim()) {
      return '❌ 错误: 搜索查询不能为空';
    }

    // 检查是否有可用的搜索源
    if (this.availableBackends.length === 0) {
      return this.getMockSearchResult(query, maxResults);
    }

    console.log(`🔍 开始搜索: ${query}`);

    // 混合模式 - 智能选择
    if (this.backend === 'hybrid' || this.backend === 'tavily') {
      // 优先使用 Tavily
      if (this.availableBackends.includes('tavily')) {
        try {
          const result = await this.searchTavily(query, maxResults);
          if (result) {
            return result;
          }
        } catch (e) {
          console.log(`⚠️ Tavily 搜索失败: ${e}`);
          // 降级到 SerpApi
          if (this.availableBackends.includes('serpapi')) {
            console.log('🔄 切换到 SerpApi 搜索');
            return await this.searchSerpApi(query, maxResults);
          }
        }
      }
    }

    // 使用 SerpApi
    if (this.availableBackends.includes('serpapi')) {
      try {
        return await this.searchSerpApi(query, maxResults);
      } catch (e) {
        console.log(`⚠️ SerpApi 搜索失败: ${e}`);
      }
    }

    // 所有搜索源都失败
    return '❌ 所有搜索源都失败了，请检查网络连接和 API 密钥配置';
  }

  /**
   * Tavily 搜索
   */
  private async searchTavily(query: string, maxResults: number): Promise<string> {
    if (!this.tavilyKey) {
      throw new Error('Tavily API Key 未配置');
    }

    // 使用 Tavily API
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: this.tavilyKey,
        query,
        search_depth: 'basic',
        include_answer: true,
        max_results: maxResults,
      }),
    });

    if (!response.ok) {
      throw new Error(`Tavily API Error: ${response.status}`);
    }

    const data = await response.json() as {
      answer?: string;
      results?: Array<{ title: string; content: string; url: string }>;
    };

    let result = '';

    // AI 直接答案
    if (data.answer) {
      result += `🎯 Tavily AI 搜索结果:\n`;
      result += `💡 直接答案: ${data.answer}\n\n`;
    } else {
      result += `🎯 Tavily 搜索结果:\n\n`;
    }

    // 相关结果
    if (data.results && data.results.length > 0) {
      result += `🔗 相关结果:\n`;
      data.results.slice(0, maxResults).forEach((item, i) => {
        result += `[${i + 1}] ${item.title}\n`;
        result += `    ${item.content.slice(0, 150)}...\n`;
        result += `    来源: ${item.url}\n\n`;
      });
    }

    return result || '未找到相关结果';
  }

  /**
   * SerpApi 搜索
   */
  private async searchSerpApi(query: string, maxResults: number): Promise<string> {
    if (!this.serpapiKey) {
      throw new Error('SerpApi API Key 未配置');
    }

    // 使用 SerpApi
    const params = new URLSearchParams({
      q: query,
      api_key: this.serpapiKey,
      num: maxResults.toString(),
    });

    const response = await fetch(`https://serpapi.com/search?${params}`);

    if (!response.ok) {
      throw new Error(`SerpApi Error: ${response.status}`);
    }

    const data = await response.json() as {
      organic_results?: Array<{ title: string; snippet: string; link: string }>;
    };

    let result = '🌐 SerpApi Google 搜索结果:\n\n';

    if (data.organic_results && data.organic_results.length > 0) {
      data.organic_results.slice(0, maxResults).forEach((item, i) => {
        result += `[${i + 1}] ${item.title}\n`;
        result += `    ${item.snippet}\n\n`;
      });
    } else {
      result += '未找到相关结果\n';
    }

    return result;
  }

  /**
   * 获取模拟搜索结果（当没有配置 API 时）
   */
  private getMockSearchResult(query: string, maxResults: number): string {
    return `📊 搜索结果 for "${query}" (最多 ${maxResults} 条):

⚠️ 注意: 当前没有配置搜索 API，将返回模拟结果。

如需启用真实搜索，请配置以下环境变量之一:

1. Tavily API (推荐)
   - 获取地址: https://tavily.com/
   - 环境变量: TAVILY_API_KEY

2. SerpApi (Google 搜索)
   - 获取地址: https://serpapi.com/
   - 环境变量: SERPAPI_API_KEY

配置后重新运行程序。

---
模拟搜索结果:
1. ${query} - 相关结果示例1
   摘要: 这是关于 "${query}" 的搜索结果摘要...

2. ${query} - 相关结果示例2
   摘要: 这是关于 "${query}" 的搜索结果摘要...

3. ${query} - 相关结果示例3
   摘要: 这是关于 "${query}" 的搜索结果摘要...`;
  }
}

/**
 * 高级搜索工具类
 * 展示多源整合和智能选择的设计模式
 */
export class AdvancedSearchTool {
  name = 'advanced_search';
  description = '高级搜索工具，整合 Tavily 和 SerpApi 多个搜索源，提供更全面的搜索结果';
  private searchTool: SearchTool;

  constructor() {
    this.searchTool = new SearchTool('hybrid');
  }

  /**
   * 执行智能搜索
   */
  async search(query: string, maxResults: number = 3): Promise<string> {
    return await this.searchTool.execute({ query, maxResults });
  }
}
