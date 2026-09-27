/**
 * Sentiment analysis stub — async AI adapter call.
 * Tags open-text responses as positive / neutral / negative.
 *
 * In production this would call an AI service (e.g. OpenAI, AWS Comprehend).
 * The stub uses simple keyword heuristics so the service is self-contained.
 */

export type Sentiment = 'positive' | 'neutral' | 'negative';

const POSITIVE_WORDS = ['great', 'excellent', 'love', 'amazing', 'fantastic', 'good', 'happy', 'satisfied', 'wonderful', 'best', 'awesome'];
const NEGATIVE_WORDS = ['bad', 'terrible', 'awful', 'hate', 'horrible', 'poor', 'worst', 'disappointed', 'frustrating', 'useless', 'broken'];

/**
 * Analyse the sentiment of a free-text string.
 * Returns a promise to simulate async AI adapter latency.
 */
export async function analyseSentiment(text: string): Promise<Sentiment> {
  if (!text || text.trim().length === 0) return 'neutral';

  const lower = text.toLowerCase();
  let positiveHits = 0;
  let negativeHits = 0;

  for (const word of POSITIVE_WORDS) {
    if (lower.includes(word)) positiveHits++;
  }
  for (const word of NEGATIVE_WORDS) {
    if (lower.includes(word)) negativeHits++;
  }

  if (positiveHits > negativeHits) return 'positive';
  if (negativeHits > positiveHits) return 'negative';
  return 'neutral';
}

/**
 * Extract all open-text answers from a response answers object.
 */
export function extractOpenTextAnswers(answers: Record<string, unknown>): string {
  const texts: string[] = [];
  for (const val of Object.values(answers)) {
    if (typeof val === 'string' && val.trim().length > 0) {
      texts.push(val.trim());
    }
  }
  return texts.join(' ');
}
