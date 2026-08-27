import { z } from "zod";

export const quizQuestionSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).min(2),
  correctIndex: z.number().int(),
  explanation: z.string(),
});

export const quizContentSchema = z.object({
  questions: z.array(quizQuestionSchema).min(1),
});

export type QuizQuestion = z.infer<typeof quizQuestionSchema>;
export type QuizContent = z.infer<typeof quizContentSchema>;

// Interactive modules store their quiz as this JSON shape in contentBody
// (doc modules store markdown-ish text there instead, video modules a URL —
// contentBody's meaning is keyed off contentType throughout this feature).
export function parseQuizContent(contentBody: string): QuizContent {
  return quizContentSchema.parse(JSON.parse(contentBody));
}
