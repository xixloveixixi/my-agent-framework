/**
 * Message 消息类
 */
import { Message as MessageType, MessageRole } from '../types';

export class Message implements MessageType {
  content: string;
  role: MessageRole;
  timestamp: Date;
  metadata?: Record<string, unknown>;

  constructor(content: string, role: MessageRole, metadata?: Record<string, unknown>) {
    this.content = content;
    this.role = role;
    this.timestamp = new Date();
    this.metadata = metadata || {};
  }

  toDict(): { role: MessageRole; content: string } {
    return {
      role: this.role,
      content: this.content,
    };
  }

  toString(): string {
    return `[${this.role}] ${this.content}`;
  }

  static fromDict(data: { role: MessageRole; content: string }): Message {
    return new Message(data.content, data.role);
  }
}
