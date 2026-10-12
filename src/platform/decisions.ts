import type { JevAnswer, JevQuestion } from '../core/questions.js';

export type Classification = { model: string; answers: Record<string, JevAnswer>; usage: unknown };
export type Classify = (
  state: Record<string, unknown>,
  questions: Record<string, JevQuestion>,
  signal?: AbortSignal,
) => Promise<Classification>;

/** One bounded JEV request with closed questions; malformed answers are technical failures. */
export function createClassifier(
  apiKey: string,
  model: string,
  request: typeof fetch = fetch,
): Classify {
  if (!apiKey.trim() || !model.trim())
    throw new Error('TYPESAFE_API_KEY and a configured JEV model are required');
  return async (state, questions, signal) => {
    const response = await request('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]),
      body: JSON.stringify({ model, state, questions }),
    });
    if (!response.ok) throw new Error(`JEV HTTP ${response.status}`);
    const body = (await response.json()) as {
      model?: unknown;
      answers?: Record<string, unknown>;
      usage?: unknown;
    };
    if (typeof body.model !== 'string') throw new Error('Invalid JEV model response');
    const answers = Object.fromEntries(
      Object.entries(questions).map(([id, question]) => [
        id,
        readAnswer(body.answers?.[id], question),
      ]),
    );
    return { model: body.model, answers, usage: body.usage };
  };
}

const unit = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

function readAnswer(value: unknown, question: JevQuestion): JevAnswer {
  const answer = value as Record<string, unknown> | undefined;
  if (answer?.type !== question.type) throw new Error('Invalid JEV answer type');
  if (question.type === 'noul') {
    if (!unit(answer.noul)) throw new Error('Invalid JEV noul');
    return { type: 'noul', noul: answer.noul };
  }
  const options =
    question.type === 'choice'
      ? Object.keys(question.criteria)
      : question.criteria.map((_, i) => String(i));
  const probabilities = answer.probabilities as Record<string, unknown> | undefined;
  if (
    !unit(answer.confidence) ||
    !probabilities ||
    Object.keys(probabilities).length !== options.length ||
    options.some((key) => !unit(probabilities[key]))
  )
    throw new Error('Invalid JEV probabilities');
  const sum = options.reduce((sum, key) => sum + (probabilities[key] as number), 0);
  if (Math.abs(sum - 1) > 0.02) throw new Error('Invalid JEV probability distribution');
  const checked = probabilities as Record<string, number>;
  if (question.type === 'choice') {
    if (typeof answer.choice !== 'string' || !options.includes(answer.choice))
      throw new Error('Invalid JEV choice');
    return {
      type: 'choice',
      choice: answer.choice,
      confidence: answer.confidence,
      probabilities: checked,
    };
  }
  if (
    typeof answer.score !== 'number' ||
    !Number.isFinite(answer.score) ||
    answer.score < 0 ||
    answer.score > options.length - 1
  )
    throw new Error('Invalid JEV score');
  return {
    type: 'score',
    score: answer.score,
    confidence: answer.confidence,
    probabilities: checked,
  };
}
