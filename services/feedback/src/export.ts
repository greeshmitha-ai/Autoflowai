import type { SurveyResults } from './survey.service.js';

/**
 * Generate a CSV string from survey results.
 */
export function generateCsv(results: SurveyResults): string {
  const lines: string[] = [];

  // Header
  lines.push('response_id,submitted_at,contact_id,sentiment,answers');

  for (const r of results.responses) {
    const answersJson = JSON.stringify(r.answers).replace(/"/g, '""');
    lines.push(
      [
        r.response_id,
        r.submitted_at instanceof Date ? r.submitted_at.toISOString() : String(r.submitted_at),
        r.contact_id ?? '',
        r.sentiment,
        `"${answersJson}"`,
      ].join(','),
    );
  }

  // Summary section
  lines.push('');
  lines.push('--- Summary ---');
  lines.push(`Total Responses,${results.total_responses}`);
  lines.push(`NPS Score,${results.nps.nps}`);
  lines.push(`Promoters,${results.nps.promoters}`);
  lines.push(`Passives,${results.nps.passives}`);
  lines.push(`Detractors,${results.nps.detractors}`);
  lines.push(`Positive Sentiment,${results.sentiment_breakdown.positive}`);
  lines.push(`Neutral Sentiment,${results.sentiment_breakdown.neutral}`);
  lines.push(`Negative Sentiment,${results.sentiment_breakdown.negative}`);

  return lines.join('\n');
}

/**
 * Generate a basic text-based PDF buffer from survey results using pdfkit.
 */
export async function generatePdf(
  surveyName: string,
  results: SurveyResults,
): Promise<Buffer> {
  // Dynamic import so pdfkit is only loaded when needed
  const PDFDocument = (await import('pdfkit')).default;

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Title
    doc.fontSize(20).text(`Survey Results: ${surveyName}`, { align: 'center' });
    doc.moveDown();

    // NPS Summary
    doc.fontSize(14).text('NPS Summary', { underline: true });
    doc.fontSize(12);
    doc.text(`NPS Score: ${results.nps.nps}`);
    doc.text(`Total Responses: ${results.total_responses}`);
    doc.text(`Promoters (9–10): ${results.nps.promoters} (${results.nps.promoter_pct.toFixed(1)}%)`);
    doc.text(`Passives (7–8): ${results.nps.passives} (${results.nps.passive_pct.toFixed(1)}%)`);
    doc.text(`Detractors (1–6): ${results.nps.detractors} (${results.nps.detractor_pct.toFixed(1)}%)`);
    doc.moveDown();

    // Sentiment Breakdown
    doc.fontSize(14).text('Sentiment Breakdown', { underline: true });
    doc.fontSize(12);
    doc.text(`Positive: ${results.sentiment_breakdown.positive}`);
    doc.text(`Neutral: ${results.sentiment_breakdown.neutral}`);
    doc.text(`Negative: ${results.sentiment_breakdown.negative}`);
    doc.moveDown();

    // Individual Responses
    doc.fontSize(14).text('Responses', { underline: true });
    doc.fontSize(10);

    for (const r of results.responses) {
      const submittedAt = r.submitted_at instanceof Date
        ? r.submitted_at.toISOString()
        : String(r.submitted_at);
      doc.text(`[${submittedAt}] Sentiment: ${r.sentiment}`);
      doc.text(`Answers: ${JSON.stringify(r.answers)}`);
      doc.moveDown(0.5);
    }

    doc.end();
  });
}
