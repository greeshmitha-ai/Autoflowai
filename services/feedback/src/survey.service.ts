import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDb, surveys, surveyResponses } from '@platform/db';
import type { Survey, NewSurvey, SurveyResponse, NewSurveyResponse } from '@platform/db';
import { computeNps, extractNpsScore } from './nps.js';
import type { NpsBreakdown } from './nps.js';

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

// ─── Survey CRUD ──────────────────────────────────────────────────────────────

export async function createSurvey(
  tenantId: string,
  data: { name: string; questions?: unknown[] },
): Promise<Survey> {
  if (!data.name?.trim()) throw new ValidationError('name is required');

  const db = getDb();
  const [survey] = await db
    .insert(surveys)
    .values({
      tenant_id: tenantId,
      name: data.name.trim(),
      questions: (data.questions ?? []) as Survey['questions'],
      status: 'draft',
    })
    .returning();

  if (!survey) throw new Error('Failed to create survey');
  return survey;
}

export async function getSurvey(tenantId: string, surveyId: string): Promise<Survey> {
  const db = getDb();
  const [survey] = await db
    .select()
    .from(surveys)
    .where(and(eq(surveys.survey_id, surveyId), eq(surveys.tenant_id, tenantId)));

  if (!survey) throw new NotFoundError(`Survey ${surveyId} not found`);
  return survey;
}

export async function listSurveys(tenantId: string): Promise<Survey[]> {
  const db = getDb();
  return db.select().from(surveys).where(eq(surveys.tenant_id, tenantId));
}

export async function publishSurvey(
  tenantId: string,
  surveyId: string,
  publicBaseUrl: string,
): Promise<Survey> {
  const survey = await getSurvey(tenantId, surveyId);

  if (survey.status === 'closed') {
    throw new ConflictError('Cannot publish a closed survey');
  }

  const shareToken = randomUUID();
  const shareLink = `${publicBaseUrl}/s/${shareToken}`;
  const embedCode = `<iframe src="${shareLink}/embed" width="100%" height="600" frameborder="0"></iframe>`;

  const db = getDb();
  const [updated] = await db
    .update(surveys)
    .set({ status: 'published', share_link: shareLink, embed_code: embedCode })
    .where(and(eq(surveys.survey_id, surveyId), eq(surveys.tenant_id, tenantId)))
    .returning();

  if (!updated) throw new NotFoundError(`Survey ${surveyId} not found`);
  return updated;
}

// ─── Survey Responses ─────────────────────────────────────────────────────────

export async function submitResponse(
  surveyId: string,
  data: {
    contact_id?: string | null;
    answers: Record<string, unknown>;
    sentiment?: 'positive' | 'neutral' | 'negative';
  },
): Promise<SurveyResponse> {
  const db = getDb();

  // Verify survey exists and is published
  const [survey] = await db
    .select({ survey_id: surveys.survey_id, tenant_id: surveys.tenant_id, status: surveys.status })
    .from(surveys)
    .where(eq(surveys.survey_id, surveyId));

  if (!survey) throw new NotFoundError(`Survey ${surveyId} not found`);
  if (survey.status !== 'published') {
    throw new ConflictError('Survey is not accepting responses');
  }

  const [response] = await db
    .insert(surveyResponses)
    .values({
      survey_id: surveyId,
      tenant_id: survey.tenant_id,
      contact_id: data.contact_id ?? null,
      answers: data.answers as SurveyResponse['answers'],
      sentiment: data.sentiment ?? 'neutral',
    })
    .returning();

  if (!response) throw new Error('Failed to store survey response');
  return response;
}

// ─── Results & NPS ────────────────────────────────────────────────────────────

export interface SurveyResults {
  survey_id: string;
  total_responses: number;
  nps: NpsBreakdown;
  sentiment_breakdown: { positive: number; neutral: number; negative: number };
  responses: SurveyResponse[];
}

export async function getSurveyResults(
  tenantId: string,
  surveyId: string,
): Promise<SurveyResults> {
  // Verify ownership
  await getSurvey(tenantId, surveyId);

  const db = getDb();
  const responses = await db
    .select()
    .from(surveyResponses)
    .where(eq(surveyResponses.survey_id, surveyId));

  const scores: number[] = [];
  const sentimentBreakdown = { positive: 0, neutral: 0, negative: 0 };

  for (const r of responses) {
    const answers = r.answers as Record<string, unknown>;
    const score = extractNpsScore(answers);
    if (score !== null) scores.push(score);

    sentimentBreakdown[r.sentiment]++;
  }

  return {
    survey_id: surveyId,
    total_responses: responses.length,
    nps: computeNps(scores),
    sentiment_breakdown: sentimentBreakdown,
    responses,
  };
}
