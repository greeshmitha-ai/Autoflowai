import { pgTable, uuid, varchar, text, jsonb, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { contacts } from './contacts.js';

export const surveyStatusEnum = pgEnum('survey_status', ['draft', 'published', 'closed']);
export const sentimentTypeEnum = pgEnum('sentiment_type', ['positive', 'neutral', 'negative']);

export const surveys = pgTable('surveys', {
  survey_id: uuid('survey_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  name: varchar('name', { length: 255 }).notNull(),
  questions: jsonb('questions').notNull().default([]),
  status: surveyStatusEnum('status').notNull().default('draft'),
  share_link: varchar('share_link', { length: 2048 }),
  embed_code: text('embed_code'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const surveyResponses = pgTable('survey_responses', {
  response_id: uuid('response_id').primaryKey().defaultRandom(),
  survey_id: uuid('survey_id')
    .notNull()
    .references(() => surveys.survey_id),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  contact_id: uuid('contact_id').references(() => contacts.contact_id),
  answers: jsonb('answers').notNull().default({}),
  sentiment: sentimentTypeEnum('sentiment').notNull().default('neutral'),
  submitted_at: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Survey = typeof surveys.$inferSelect;
export type NewSurvey = typeof surveys.$inferInsert;
export type SurveyResponse = typeof surveyResponses.$inferSelect;
export type NewSurveyResponse = typeof surveyResponses.$inferInsert;
