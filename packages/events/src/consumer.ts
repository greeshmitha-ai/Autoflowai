import {
  Kafka,
  type Consumer,
  type EachMessagePayload,
  type KafkaMessage,
} from 'kafkajs';
import type { PlatformEvent, EventType } from './types.js';

export interface ConsumerConfig {
  brokers: string[];
  clientId?: string;
  groupId: string;
}

export type EventHandler<T extends PlatformEvent = PlatformEvent> = (
  event: T,
  raw: KafkaMessage,
) => Promise<void>;

export interface DeadLetterConfig {
  topic: string;
  maxRetries?: number;
}

export class EventConsumer {
  private kafka: Kafka;
  private consumer: Consumer | null = null;
  private handlers: Map<EventType, EventHandler> = new Map();
  private dlqConfig: DeadLetterConfig | null = null;
  private dlqProducer: ReturnType<Kafka['producer']> | null = null;

  constructor(config: ConsumerConfig) {
    this.kafka = new Kafka({
      clientId: config.clientId ?? 'platform-consumer',
      brokers: config.brokers ?? (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
    });
    this.consumer = this.kafka.consumer({ groupId: config.groupId });
  }

  /**
   * Configure dead-letter queue for failed messages.
   */
  withDeadLetterQueue(config: DeadLetterConfig): this {
    this.dlqConfig = config;
    return this;
  }

  /**
   * Register a typed handler for a specific event type.
   */
  on<T extends PlatformEvent>(eventType: T['type'], handler: EventHandler<T>): this {
    this.handlers.set(eventType, handler as EventHandler);
    return this;
  }

  async connect(): Promise<void> {
    if (!this.consumer) throw new Error('Consumer not initialized');
    await this.consumer.connect();

    if (this.dlqConfig) {
      this.dlqProducer = this.kafka.producer();
      await this.dlqProducer.connect();
    }
  }

  async subscribe(topics: string[]): Promise<void> {
    if (!this.consumer) throw new Error('Consumer not connected');
    for (const topic of topics) {
      await this.consumer.subscribe({ topic, fromBeginning: false });
    }
  }

  async run(): Promise<void> {
    if (!this.consumer) throw new Error('Consumer not connected');

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        await this.handleMessage(payload);
      },
    });
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { message } = payload;
    const maxRetries = this.dlqConfig?.maxRetries ?? 3;

    if (!message.value) return;

    let event: PlatformEvent;
    try {
      event = JSON.parse(message.value.toString()) as PlatformEvent;
    } catch {
      await this.sendToDlq(payload, new Error('Failed to parse event JSON'));
      return;
    }

    const handler = this.handlers.get(event.type);
    if (!handler) return; // No handler registered for this event type

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < maxRetries) {
      try {
        await handler(event, message);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        attempt++;
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          await sleep(Math.pow(2, attempt - 1) * 1000);
        }
      }
    }

    // All retries exhausted — send to DLQ
    await this.sendToDlq(payload, lastError ?? new Error('Unknown error'));
  }

  private async sendToDlq(payload: EachMessagePayload, error: Error): Promise<void> {
    if (!this.dlqConfig || !this.dlqProducer) return;

    console.error(`Sending message to DLQ (${this.dlqConfig.topic}):`, error.message);

    await this.dlqProducer.send({
      topic: this.dlqConfig.topic,
      messages: [
        {
          key: payload.message.key,
          value: payload.message.value,
          headers: {
            ...payload.message.headers,
            'dlq-error': error.message,
            'dlq-original-topic': payload.topic,
            'dlq-timestamp': new Date().toISOString(),
          },
        },
      ],
    });
  }

  async disconnect(): Promise<void> {
    if (this.consumer) {
      await this.consumer.disconnect();
      this.consumer = null;
    }
    if (this.dlqProducer) {
      await this.dlqProducer.disconnect();
      this.dlqProducer = null;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
