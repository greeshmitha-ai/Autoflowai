import { Kafka, type Producer, type ProducerRecord, CompressionTypes } from 'kafkajs';
import { randomUUID } from 'crypto';
import type { PlatformEvent, EventType } from './types.js';

export interface PublisherConfig {
  brokers: string[];
  clientId?: string;
}

export class EventPublisher {
  private kafka: Kafka;
  private producer: Producer | null = null;
  private tenantId: string;

  constructor(tenantId: string, config?: PublisherConfig) {
    if (!tenantId) throw new Error('tenantId is required for EventPublisher');

    this.tenantId = tenantId;
    this.kafka = new Kafka({
      clientId: config?.clientId ?? 'platform-publisher',
      brokers: config?.brokers ?? (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
    });
  }

  async connect(): Promise<void> {
    this.producer = this.kafka.producer({
      allowAutoTopicCreation: false,
      transactionTimeout: 30_000,
    });
    await this.producer.connect();
  }

  async disconnect(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }
  }

  async publish<T extends PlatformEvent>(
    topic: string,
    type: T['type'],
    payload: T['payload'],
  ): Promise<void> {
    if (!this.producer) {
      throw new Error('EventPublisher not connected. Call connect() first.');
    }

    const event: PlatformEvent = {
      event_id: randomUUID(),
      tenant_id: this.tenantId,
      timestamp: new Date().toISOString(),
      version: '1.0',
      type,
      payload,
    } as PlatformEvent;

    const record: ProducerRecord = {
      topic,
      compression: CompressionTypes.GZIP,
      messages: [
        {
          key: this.tenantId,
          value: JSON.stringify(event),
          headers: {
            'event-type': type,
            'tenant-id': this.tenantId,
            'event-version': '1.0',
          },
        },
      ],
    };

    await this.producer.send(record);
  }
}

/**
 * Factory to create a tenant-scoped publisher.
 */
export function createPublisher(tenantId: string, config?: PublisherConfig): EventPublisher {
  return new EventPublisher(tenantId, config);
}
