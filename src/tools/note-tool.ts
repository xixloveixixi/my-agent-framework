/**
 * NoteTool - 笔记工具
 * 提供笔记的完整生命周期管理
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { BaseTool, ToolParameter } from './base';

export interface NoteMetadata {
  id: string;
  title: string;
  type: NoteType;
  tags: string[];
  created_at: string;
  updated_at: string;
  file_path?: string;
}

export type NoteType = 'task_state' | 'conclusion' | 'blocker' | 'action' | 'reference' | 'general';

export interface NoteResult {
  note_id: string;
  title: string;
  type: NoteType;
  tags: string[];
  content: string;
  updated_at: string;
}

export class NoteTool extends BaseTool {
  name = 'note';
  description = '笔记管理系统，支持创建、读取、更新、搜索、列出、汇总和删除笔记';
  private workspace: string;
  private indexPath: string;
  private index: Record<string, NoteMetadata> = {};

  constructor(workspace: string = './notes') {
    super();
    this.workspace = workspace;
    this.indexPath = path.join(workspace, '.note-index.json');
    this.ensureWorkspace();
    this.loadIndex();
  }

  /**
   * 确保工作目录存在
   */
  private ensureWorkspace(): void {
    if (!fs.existsSync(this.workspace)) {
      fs.mkdirSync(this.workspace, { recursive: true });
    }
  }

  /**
   * 加载索引
   */
  private loadIndex(): void {
    try {
      if (fs.existsSync(this.indexPath)) {
        const data = fs.readFileSync(this.indexPath, 'utf-8');
        this.index = JSON.parse(data);
      }
    } catch (error) {
      console.warn('[NoteTool] 加载索引失败，使用空索引');
      this.index = {};
    }
  }

  /**
   * 保存索引
   */
  private saveIndex(): void {
    fs.writeFileSync(this.indexPath, JSON.stringify(this.index, null, 2), 'utf-8');
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    const random = Math.random().toString(36).slice(2, 6);
    return `note_${timestamp}_${random}`;
  }

  /**
   * 构建 Markdown 内容
   */
  private buildMarkdown(metadata: NoteMetadata, content: string): string {
    const yamlContent = yaml.stringify(metadata, { indent: 2 });
    return `---\n${yamlContent}---\n\n${content}`;
  }

  /**
   * 解析 Markdown 内容
   */
  private parseMarkdown(rawContent: string): { metadata: NoteMetadata; content: string } {
    const parts = rawContent.split('---\n');

    if (parts.length >= 3) {
      const yamlStr = parts[1];
      const content = parts.slice(2).join('---\n').trim();
      const metadata = yaml.parse(yamlStr) as NoteMetadata;
      return { metadata, content };
    }

    return {
      metadata: {} as NoteMetadata,
      content: rawContent.trim(),
    };
  }

  getParameters(): ToolParameter[] {
    return [
      {
        name: 'action',
        type: 'string',
        description: '操作类型: create(创建), read(读取), update(更新), search(搜索), list(列出), summary(摘要), delete(删除)',
        required: true,
      },
      {
        name: 'note_id',
        type: 'string',
        description: '笔记 ID（用于 read, update, delete 操作）',
        required: false,
      },
      {
        name: 'title',
        type: 'string',
        description: '笔记标题（用于 create, update 操作）',
        required: false,
      },
      {
        name: 'content',
        type: 'string',
        description: '笔记内容，Markdown 格式（用于 create, update 操作）',
        required: false,
      },
      {
        name: 'note_type',
        type: 'string',
        description: '笔记类型: task_state, conclusion, blocker, action, reference, general',
        required: false,
        default: 'general',
      },
      {
        name: 'tags',
        type: 'array',
        description: '标签列表',
        required: false,
      },
      {
        name: 'query',
        type: 'string',
        description: '搜索关键词（用于 search 操作）',
        required: false,
      },
      {
        name: 'limit',
        type: 'number',
        description: '返回结果数量限制，默认 10',
        required: false,
        default: 10,
      },
    ];
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    const action = params.action as string;

    try {
      switch (action) {
        case 'create':
          return this.createNote(
            params.title as string,
            params.content as string,
            params.note_type as NoteType,
            params.tags as string[]
          );

        case 'read':
          return this.readNote(params.note_id as string);

        case 'update':
          return this.updateNote(
            params.note_id as string,
            params.title as string,
            params.content as string,
            params.note_type as NoteType,
            params.tags as string[]
          );

        case 'search':
          return this.searchNotes(
            params.query as string,
            params.limit as number,
            params.note_type as NoteType,
            params.tags as string[]
          );

        case 'list':
          return this.listNotes(
            params.note_type as NoteType,
            params.tags as string[],
            params.limit as number
          );

        case 'summary':
          return this.getSummary();

        case 'delete':
          return this.deleteNote(params.note_id as string);

        default:
          return `❌ 未知操作: ${action}，支持的操作: create, read, update, search, list, summary, delete`;
      }
    } catch (error) {
      return `❌ 笔记工具执行错误: ${(error as Error).message}`;
    }
  }

  /**
   * 创建笔记
   */
  private createNote(
    title: string,
    content: string,
    noteType: NoteType = 'general',
    tags: string[] = []
  ): string {
    if (!title || !content) {
      return '❌ 创建笔记需要提供 title 和 content 参数';
    }

    const noteId = this.generateId();
    const now = new Date().toISOString();

    const metadata: NoteMetadata = {
      id: noteId,
      title,
      type: noteType,
      tags,
      created_at: now,
      updated_at: now,
    };

    const filePath = path.join(this.workspace, `${noteId}.md`);
    const mdContent = this.buildMarkdown(metadata, content);

    fs.writeFileSync(filePath, mdContent, 'utf-8');

    metadata.file_path = filePath;
    this.index[noteId] = metadata;
    this.saveIndex();

    return `✅ 笔记创建成功 (ID: ${noteId})
📝 标题: ${title}
📂 类型: ${noteType}
🏷️ 标签: ${tags.join(', ') || '无'}`;
  }

  /**
   * 读取笔记
   */
  private readNote(noteId: string): string {
    if (!noteId) {
      return '❌ 读取笔记需要提供 note_id 参数';
    }

    if (!this.index[noteId]) {
      return `❌ 笔记不存在: ${noteId}`;
    }

    const filePath = this.index[noteId].file_path;
    if (!filePath || !fs.existsSync(filePath)) {
      return `❌ 笔记文件不存在: ${noteId}`;
    }

    const rawContent = fs.readFileSync(filePath, 'utf-8');
    const { metadata, content } = this.parseMarkdown(rawContent);

    return `📄 笔记: ${metadata.title}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🆔 ID: ${noteId}
📂 类型: ${metadata.type}
🏷️ 标签: ${metadata.tags.join(', ') || '无'}
📅 创建: ${new Date(metadata.created_at).toLocaleString()}
🔄 更新: ${new Date(metadata.updated_at).toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${content}`;
  }

  /**
   * 更新笔记
   */
  private updateNote(
    noteId: string,
    title?: string,
    content?: string,
    noteType?: NoteType,
    tags?: string[]
  ): string {
    if (!noteId) {
      return '❌ 更新笔记需要提供 note_id 参数';
    }

    if (!this.index[noteId]) {
      return `❌ 笔记不存在: ${noteId}`;
    }

    const filePath = this.index[noteId].file_path!;
    const rawContent = fs.readFileSync(filePath, 'utf-8');
    const { metadata, content: oldContent } = this.parseMarkdown(rawContent);

    // 更新字段
    if (title) metadata.title = title;
    if (noteType) metadata.type = noteType;
    if (tags !== undefined) metadata.tags = tags;
    const newContent = content ?? oldContent;
    metadata.updated_at = new Date().toISOString();

    // 保存
    const mdContent = this.buildMarkdown(metadata, newContent);
    fs.writeFileSync(filePath, mdContent, 'utf-8');

    this.index[noteId] = metadata;
    this.saveIndex();

    return `✅ 笔记已更新: ${metadata.title}`;
  }

  /**
   * 搜索笔记
   */
  private searchNotes(
    query?: string,
    limit: number = 10,
    noteType?: NoteType,
    tags?: string[]
  ): string {
    if (!query) {
      return '❌ 搜索笔记需要提供 query 参数';
    }

    const results: NoteResult[] = [];
    const queryLower = query.toLowerCase();

    for (const [noteId, metadata] of Object.entries(this.index)) {
      // 类型过滤
      if (noteType && metadata.type !== noteType) continue;

      // 标签过滤
      if (tags && tags.length > 0) {
        const noteTags = new Set(metadata.tags);
        if (!tags.some(tag => noteTags.has(tag))) continue;
      }

      // 读取内容
      try {
        const filePath = metadata.file_path!;
        if (!fs.existsSync(filePath)) continue;

        const rawContent = fs.readFileSync(filePath, 'utf-8');
        const { content } = this.parseMarkdown(rawContent);

        // 标题和内容搜索
        if (
          metadata.title.toLowerCase().includes(queryLower) ||
          content.toLowerCase().includes(queryLower)
        ) {
          results.push({
            note_id: noteId,
            title: metadata.title,
            type: metadata.type,
            tags: metadata.tags,
            content,
            updated_at: metadata.updated_at,
          });
        }
      } catch (error) {
        console.warn(`[NoteTool] 读取笔记 ${noteId} 失败:`, error);
      }
    }

    // 按更新时间排序
    results.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    const limitedResults = results.slice(0, limit);

    if (limitedResults.length === 0) {
      return `🔍 未找到与 '${query}' 相关的笔记`;
    }

    const output = [`🔍 找到 ${limitedResults.length} 条相关笔记:\n`];
    limitedResults.forEach((note, index) => {
      const contentPreview = note.content.length > 60
        ? note.content.slice(0, 60) + '...'
        : note.content;
      output.push(
        `${index + 1}. [${note.type}] ${note.title}`
      );
      output.push(`   ${contentPreview}`);
      output.push(`   🆔 ${note.note_id} | 🏷️ ${note.tags.join(', ') || '无'}\n`);
    });

    return output.join('\n');
  }

  /**
   * 列出笔记
   */
  private listNotes(
    noteType?: NoteType,
    tags?: string[],
    limit: number = 20
  ): string {
    let results: NoteMetadata[] = [];

    for (const metadata of Object.values(this.index)) {
      // 类型过滤
      if (noteType && metadata.type !== noteType) continue;

      // 标签过滤
      if (tags && tags.length > 0) {
        const noteTags = new Set(metadata.tags);
        if (!tags.some(tag => noteTags.has(tag))) continue;
      }

      results.push(metadata);
    }

    // 按更新时间排序
    results.sort((a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

    const limitedResults = results.slice(0, limit);

    if (limitedResults.length === 0) {
      return '📝 暂无笔记';
    }

    const output = [`📝 共 ${limitedResults.length} 条笔记:\n`];
    limitedResults.forEach((note, index) => {
      output.push(
        `${index + 1}. [${note.type}] ${note.title}`
      );
      output.push(`   🏷️ ${note.tags.join(', ') || '无'} | 🔄 ${new Date(note.updated_at).toLocaleString()}`);
      output.push(`   🆔 ${note.id}\n`);
    });

    return output.join('\n');
  }

  /**
   * 获取摘要
   */
  private getSummary(): string {
    const totalCount = Object.keys(this.index).length;

    // 按类型统计
    const typeCounts: Record<string, number> = {};
    for (const metadata of Object.values(this.index)) {
      const noteType = metadata.type || 'general';
      typeCounts[noteType] = (typeCounts[noteType] || 0) + 1;
    }

    // 最近更新的笔记
    const recentNotes = Object.values(this.index)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 5);

    const typeLabels: Record<string, string> = {
      task_state: '任务状态',
      conclusion: '结论',
      blocker: '阻碍',
      action: '行动项',
      reference: '参考',
      general: '通用',
    };

    const output = ['📊 笔记统计:\n'];
    output.push(`📝 总笔记数: ${totalCount}`);
    output.push('\n📂 类型分布:');
    for (const [type, count] of Object.entries(typeCounts)) {
      output.push(`   • ${typeLabels[type] || type}: ${count}`);
    }

    output.push('\n🕐 最近更新:');
    recentNotes.forEach((note, index) => {
      output.push(`   ${index + 1}. ${note.title} (${new Date(note.updated_at).toLocaleDateString()})`);
    });

    return output.join('\n');
  }

  /**
   * 删除笔记
   */
  private deleteNote(noteId: string): string {
    if (!noteId) {
      return '❌ 删除笔记需要提供 note_id 参数';
    }

    if (!this.index[noteId]) {
      return `❌ 笔记不存在: ${noteId}`;
    }

    // 删除文件
    const filePath = this.index[noteId].file_path;
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // 从索引中移除
    const title = this.index[noteId].title;
    delete this.index[noteId];
    this.saveIndex();

    return `✅ 笔记已删除: ${title}`;
  }
}
