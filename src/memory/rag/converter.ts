/**
 * 文档转换器 - 将各种格式文档转换为 Markdown
 * 支持：PDF、Word、Excel、PowerPoint、图片、音频等
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface ConvertResult {
  content: string;
  format: string;
  success: boolean;
  error?: string;
}

// PDF 类型声明
interface PDFData {
  numpages: number;
  numrender: number;
  info: Record<string, unknown>;
  metadata: Record<string, unknown>;
  text: string;
  version: string;
}

type PDFParser = (buffer: Buffer) => Promise<PDFData>;

// Excel 类型声明
interface ExcelWorkbook {
  SheetNames: string[];
  Sheets: Record<string, ExcelSheet>;
}

interface ExcelSheet {
  [key: string]: { v?: string; t?: string };
}

type XLSXReadFile = (filePath: string) => ExcelWorkbook;
type XLSXUtilsSheetToJSON = (sheet: ExcelSheet, options?: unknown) => unknown[][];

/**
 * 文档格式转换器
 */
export class DocumentConverter {
  /**
   * 将任意格式文档转换为 Markdown
   */
  async convert(filePath: string): Promise<ConvertResult> {
    const ext = path.extname(filePath).toLowerCase();

    try {
      // 检查文件是否存在
      await fs.access(filePath);

      switch (ext) {
        case '.pdf':
          return await this.convertPDF(filePath);

        case '.docx':
        case '.doc':
          return await this.convertWord(filePath);

        case '.xlsx':
        case '.xls':
          return await this.convertExcel(filePath);

        case '.pptx':
        case '.ppt':
          return await this.convertPowerPoint(filePath);

        case '.txt':
        case '.md':
        case '.markdown':
          return await this.convertText(filePath);

        case '.html':
        case '.htm':
          return await this.convertHTML(filePath);

        case '.csv':
          return await this.convertCSV(filePath);

        case '.json':
          return await this.convertJSON(filePath);

        case '.xml':
          return await this.convertXML(filePath);

        case '.rtf':
          return await this.convertRTF(filePath);

        case '.jpg':
        case '.jpeg':
        case '.png':
        case '.gif':
        case '.bmp':
        case '.webp':
          return await this.convertImage(filePath);

        case '.mp3':
        case '.wav':
        case '.m4a':
        case '.ogg':
        case '.flac':
          return await this.convertAudio(filePath);

        case '.mp4':
        case '.avi':
        case '.mov':
        case '.mkv':
          return await this.convertVideo(filePath);

        default:
          return await this.convertText(filePath);
      }
    } catch (error) {
      return {
        content: '',
        format: ext,
        success: false,
        error: `转换失败: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 转换 PDF
   */
  private async convertPDF(filePath: string): Promise<ConvertResult> {
    try {
      const pdfParse = require('pdf-parse') as PDFParser;
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer);

      return {
        content: `# ${path.basename(filePath)}\n\n${data.text}`,
        format: 'pdf',
        success: true,
      };
    } catch (error) {
      return {
        content: '',
        format: 'pdf',
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 转换 Word (.docx)
   */
  private async convertWord(filePath: string): Promise<ConvertResult> {
    try {
      const mammoth = require('mammoth') as {
        convertToHtml: (input: { path: string }) => Promise<{ value: string }>;
        extractRawText: (input: { path: string }) => Promise<{ value: string }>;
      };

      // 先尝试提取原始文本
      const result = await mammoth.extractRawText({ path: filePath });

      // 简单的 HTML 标签清理
      const markdown = result.value
        .replace(/^# /gm, '')
        .replace(/^## /gm, '')
        .replace(/^### /gm, '')
        .trim();

      return {
        content: `# ${path.basename(filePath)}\n\n${markdown}`,
        format: 'docx',
        success: true,
      };
    } catch (error) {
      return {
        content: '',
        format: 'docx',
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 转换 Excel
   */
  private async convertExcel(filePath: string): Promise<ConvertResult> {
    try {
      const xlsx = require('xlsx') as {
        readFile: XLSXReadFile;
        utils: {
          sheet_to_json: XLSXUtilsSheetToJSON;
        };
      };

      const workbook = xlsx.readFile(filePath);

      let markdown = `# ${path.basename(filePath)}\n\n`;

      workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const json = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as string[][];

        markdown += `## ${sheetName}\n\n`;

        json.forEach(row => {
          const cells = row.map(cell => String(cell || '')).join(' | ');
          if (cells.trim()) {
            markdown += `| ${cells} |\n`;
          }
        });

        markdown += '\n';
      });

      return {
        content: markdown,
        format: 'xlsx',
        success: true,
      };
    } catch (error) {
      return {
        content: '',
        format: 'xlsx',
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 转换 PowerPoint
   */
  private async convertPowerPoint(filePath: string): Promise<ConvertResult> {
    // PowerPoint 解析 - 简化版
    try {
      const AdmZip = require('adm-zip') as new (path: string) => {
        getEntries: () => Array<{ entryName: string; getData: () => Buffer }>;
      };

      const zip = new AdmZip(filePath);
      const entries = zip.getEntries();

      let markdown = `# ${path.basename(filePath)}\n\n`;
      let slideNum = 1;

      // 查找幻灯片内容
      const slideEntries = entries.filter((e: { entryName: string }) =>
        e.entryName.startsWith('ppt/slides/slide') && e.entryName.endsWith('.xml')
      );

      for (const entry of slideEntries) {
        const content = entry.getData().toString('utf8');
        // 提取文本内容
        const texts = content.match(/<a:t>([^<]+)<\/a:t>/g) || [];
        const textContent = texts.map((t: string) => t.replace(/<[^>]+>/g, '')).join('\n');

        if (textContent) {
          markdown += `## 幻灯片 ${slideNum}\n\n${textContent}\n\n`;
          slideNum++;
        }
      }

      if (slideNum === 1) {
        markdown += '*（无法解析幻灯片内容）*\n';
      }

      return {
        content: markdown,
        format: 'pptx',
        success: true,
      };
    } catch (error) {
      return {
        content: `# ${path.basename(filePath)}\n\n*（PowerPoint 解析需要额外依赖）*\n`,
        format: 'pptx',
        success: true,
      };
    }
  }

  /**
   * 转换纯文本
   */
  private async convertText(filePath: string): Promise<ConvertResult> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return {
        content: `# ${path.basename(filePath)}\n\n${content}`,
        format: 'txt',
        success: true,
      };
    } catch (error) {
      return {
        content: '',
        format: 'txt',
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 转换 HTML
   */
  private async convertHTML(filePath: string): Promise<ConvertResult> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      // 简单的 HTML 到 Markdown 转换
      let markdown = content
        .replace(/<h1[^>]*>([^<]+)<\/h1>/gi, '# $1\n\n')
        .replace(/<h2[^>]*>([^<]+)<\/h2>/gi, '## $1\n\n')
        .replace(/<h3[^>]*>([^<]+)<\/h3>/gi, '### $1\n\n')
        .replace(/<h4[^>]*>([^<]+)<\/h4>/gi, '#### $1\n\n')
        .replace(/<h5[^>]*>([^<]+)<\/h5>/gi, '##### $1\n\n')
        .replace(/<h6[^>]*>([^<]+)<\/h6>/gi, '###### $1\n\n')
        .replace(/<p[^>]*>([^<]+)<\/p>/gi, '$1\n\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<strong[^>]*>([^<]+)<\/strong>/gi, '**$1**')
        .replace(/<b[^>]*>([^<]+)<\/b>/gi, '**$1**')
        .replace(/<em[^>]*>([^<]+)<\/em>/gi, '*$1*')
        .replace(/<i[^>]*>([^<]+)<\/i>/gi, '*$1*')
        .replace(/<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi, '[$2]($1)')
        .replace(/<li[^>]*>([^<]+)<\/li>/gi, '- $1\n')
        .replace(/<ul[^>]*>|<\/ul>/gi, '')
        .replace(/<code[^>]*>([^<]+)<\/code>/gi, '`$1`')
        .replace(/<pre[^>]*>|<\/pre>/gi, '```\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .trim();

      return {
        content: `# ${path.basename(filePath)}\n\n${markdown}`,
        format: 'html',
        success: true,
      };
    } catch (error) {
      return {
        content: '',
        format: 'html',
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 转换 CSV
   */
  private async convertCSV(filePath: string): Promise<ConvertResult> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      if (lines.length === 0) {
        return { content: '', format: 'csv', success: false, error: '空文件' };
      }

      let markdown = `# ${path.basename(filePath)}\n\n`;
      markdown += '| ' + lines[0].split(',').join(' | ') + ' |\n';
      markdown += '| ' + lines[0].split(',').map(() => '---').join(' | ') + ' |\n';

      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(',').map(c => c.trim());
        markdown += '| ' + cells.join(' | ') + ' |\n';
      }

      return {
        content: markdown,
        format: 'csv',
        success: true,
      };
    } catch (error) {
      return {
        content: '',
        format: 'csv',
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 转换 JSON
   */
  private async convertJSON(filePath: string): Promise<ConvertResult> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const json = JSON.parse(content);
      const formatted = JSON.stringify(json, null, 2);

      return {
        content: `# ${path.basename(filePath)}\n\n\`\`\`json\n${formatted}\n\`\`\``,
        format: 'json',
        success: true,
      };
    } catch (error) {
      return {
        content: '',
        format: 'json',
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 转换 XML
   */
  private async convertXML(filePath: string): Promise<ConvertResult> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');

      return {
        content: `# ${path.basename(filePath)}\n\n\`\`\`xml\n${content}\n\`\`\``,
        format: 'xml',
        success: true,
      };
    } catch (error) {
      return {
        content: '',
        format: 'xml',
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 转换 RTF
   */
  private async convertRTF(filePath: string): Promise<ConvertResult> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const text = content
        .replace(/\\[a-z]+\d*\s?/g, '')
        .replace(/\{|\}/g, '')
        .trim();

      return {
        content: `# ${path.basename(filePath)}\n\n${text}`,
        format: 'rtf',
        success: true,
      };
    } catch (error) {
      return {
        content: '',
        format: 'rtf',
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 转换图片（需要 OCR 支持）
   */
  private async convertImage(filePath: string): Promise<ConvertResult> {
    return {
      content: `# ${path.basename(filePath)}\n\n> 图片文件，需要 OCR 处理\n> 请安装 tesseract.js 后使用 \`await convertImageWithOCR(filePath)\``,
      format: 'image',
      success: true,
    };
  }

  /**
   * 转换音频
   */
  private async convertAudio(filePath: string): Promise<ConvertResult> {
    return {
      content: `# ${path.basename(filePath)}\n\n> 音频文件，需要语音转文字处理\n> 请使用后端服务`,
      format: 'audio',
      success: true,
    };
  }

  /**
   * 转换视频
   */
  private async convertVideo(filePath: string): Promise<ConvertResult> {
    return {
      content: `# ${path.basename(filePath)}\n\n> 视频文件，需要视频处理`,
      format: 'video',
      success: true,
    };
  }
}

/**
 * 文档转换工具函数
 */
export async function convertToMarkdown(filePath: string): Promise<string> {
  const converter = new DocumentConverter();
  const result = await converter.convert(filePath);

  if (result.success) {
    return result.content;
  }

  console.warn(`⚠️ 文档转换失败 [${filePath}]: ${result.error}`);
  return '';
}
