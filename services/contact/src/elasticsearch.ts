import { Client } from '@elastic/elasticsearch';
import type { Contact } from '@platform/db';

let esClient: Client | null = null;

export function getElasticsearchClient(url?: string): Client {
  if (!esClient) {
    esClient = new Client({
      node: url ?? process.env['ELASTICSEARCH_URL'] ?? 'http://localhost:9200',
    });
  }
  return esClient;
}

export const CONTACTS_INDEX = 'contacts';

export interface ContactDocument {
  contact_id: string;
  tenant_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  tags: string[];
  lifecycle_stage: string | null;
  lead_score: number;
  lead_score_confidence: 'high' | 'low';
  created_at: string;
  updated_at: string;
}

export function toContactDocument(contact: Contact): ContactDocument {
  return {
    contact_id: contact.contact_id,
    tenant_id: contact.tenant_id,
    full_name: contact.full_name ?? null,
    email: contact.email ?? null,
    phone: contact.phone ?? null,
    company_name: contact.company_name ?? null,
    tags: contact.tags ?? [],
    lifecycle_stage: contact.lifecycle_stage ?? null,
    lead_score: contact.lead_score,
    lead_score_confidence: contact.lead_score_confidence,
    created_at: contact.created_at.toISOString(),
    updated_at: contact.updated_at.toISOString(),
  };
}

export async function ensureContactsIndex(client: Client): Promise<void> {
  const exists = await client.indices.exists({ index: CONTACTS_INDEX });
  if (!exists) {
    await client.indices.create({
      index: CONTACTS_INDEX,
      mappings: {
        properties: {
          contact_id: { type: 'keyword' },
          tenant_id: { type: 'keyword' },
          full_name: { type: 'text', analyzer: 'standard' },
          email: { type: 'keyword' },
          phone: { type: 'keyword' },
          company_name: { type: 'text', analyzer: 'standard' },
          tags: { type: 'keyword' },
          lifecycle_stage: { type: 'keyword' },
          lead_score: { type: 'integer' },
          lead_score_confidence: { type: 'keyword' },
          created_at: { type: 'date' },
          updated_at: { type: 'date' },
        },
      },
    });
  }
}

export async function indexContact(client: Client, contact: Contact): Promise<void> {
  await client.index({
    index: CONTACTS_INDEX,
    id: contact.contact_id,
    document: toContactDocument(contact),
  });
}

export async function searchContacts(
  client: Client,
  tenantId: string,
  query: string,
  options: {
    page?: number;
    limit?: number;
    tags?: string[];
    lifecycle_stage?: string;
    lead_score_min?: number;
    lead_score_max?: number;
  } = {},
): Promise<{ hits: ContactDocument[]; total: number }> {
  const { page = 1, limit = 20 } = options;
  const from = (page - 1) * limit;

  const filters: object[] = [{ term: { tenant_id: tenantId } }];

  if (options.tags && options.tags.length > 0) {
    filters.push({ terms: { tags: options.tags } });
  }
  if (options.lifecycle_stage) {
    filters.push({ term: { lifecycle_stage: options.lifecycle_stage } });
  }
  if (options.lead_score_min !== undefined || options.lead_score_max !== undefined) {
    const range: Record<string, number> = {};
    if (options.lead_score_min !== undefined) range['gte'] = options.lead_score_min;
    if (options.lead_score_max !== undefined) range['lte'] = options.lead_score_max;
    filters.push({ range: { lead_score: range } });
  }

  const esQuery = query
    ? {
        bool: {
          must: {
            multi_match: {
              query,
              fields: ['full_name^2', 'email', 'company_name', 'phone'],
              type: 'best_fields' as const,
              fuzziness: 'AUTO',
            },
          },
          filter: filters,
        },
      }
    : {
        bool: {
          filter: filters,
        },
      };

  const result = await client.search<ContactDocument>({
    index: CONTACTS_INDEX,
    from,
    size: limit,
    query: esQuery,
  });

  const hits = result.hits.hits
    .map((h) => h._source)
    .filter((s): s is ContactDocument => s !== undefined);

  const total =
    typeof result.hits.total === 'number'
      ? result.hits.total
      : (result.hits.total?.value ?? 0);

  return { hits, total };
}

export async function deleteContactFromIndex(client: Client, contactId: string): Promise<void> {
  try {
    await client.delete({ index: CONTACTS_INDEX, id: contactId });
  } catch {
    // Ignore not-found errors
  }
}
