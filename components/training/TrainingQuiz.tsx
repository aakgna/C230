"use client";

import { useState, useTransition } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { QuizContent } from "@/lib/training/quiz";
import { recordTrainingCompletion } from "@/app/(app)/training/actions";

export function TrainingQuiz({ quiz, moduleId }: { quiz: QuizContent; moduleId: string }) {
  const [answers, setAnswers] = useState<(number | null)[]>(quiz.questions.map(() => null));
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  const allAnswered = answers.every((a) => a !== null);
  const correctCount = answers.filter((a, i) => a === quiz.questions[i].correctIndex).length;
  const scorePct = Math.round((correctCount / quiz.questions.length) * 100);
  const passed = submitted && scorePct >= 80;

  function selectAnswer(questionIndex: number, optionIndex: number) {
    if (submitted) return;
    setAnswers((prev) => prev.map((a, i) => (i === questionIndex ? optionIndex : a)));
  }

  return (
    <div className="space-y-6">
      {quiz.questions.map((q, qi) => {
        const selected = answers[qi];
        return (
          <fieldset key={qi} className="space-y-2">
            <legend className="text-sm font-medium">
              {qi + 1}. {q.question}
            </legend>
            <div className="space-y-1.5" role="radiogroup" aria-label={q.question}>
              {q.options.map((option, oi) => {
                const isSelected = selected === oi;
                const isCorrectOption = oi === q.correctIndex;
                const showAsCorrect = submitted && isCorrectOption;
                const showAsIncorrect = submitted && isSelected && !isCorrectOption;
                return (
                  <button
                    key={oi}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    disabled={submitted}
                    onClick={() => selectAnswer(qi, oi)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      isSelected && !submitted && "border-primary bg-primary/5",
                      !isSelected && !submitted && "border-input hover:bg-muted",
                      showAsCorrect && "border-primary bg-primary/10",
                      showAsIncorrect && "border-destructive bg-destructive/10",
                      submitted && !isSelected && !isCorrectOption && "opacity-60"
                    )}
                  >
                    <span>{option}</span>
                    {showAsCorrect && <CheckIcon className="size-4 shrink-0 text-primary" />}
                    {showAsIncorrect && <XIcon className="size-4 shrink-0 text-destructive" />}
                  </button>
                );
              })}
            </div>
            {submitted && (
              <p className="text-sm text-muted-foreground">
                {selected === q.correctIndex ? "Correct. " : "Not quite. "}
                {q.explanation}
              </p>
            )}
          </fieldset>
        );
      })}

      {!submitted ? (
        <Button type="button" disabled={!allAnswered} onClick={() => setSubmitted(true)}>
          Submit answers
        </Button>
      ) : (
        <div className="space-y-3 rounded-lg border p-3">
          <p className="text-sm font-medium">
            {correctCount} of {quiz.questions.length} correct ({scorePct}%)
          </p>
          {passed ? (
            <Button
              type="button"
              disabled={isPending}
              onClick={() => {
                const formData = new FormData();
                formData.set("moduleId", moduleId);
                startTransition(() => recordTrainingCompletion(formData));
              }}
            >
              {isPending ? "Saving…" : "Mark complete"}
            </Button>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Review the explanations above, then retake the quiz — 80% or higher marks this module complete.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAnswers(quiz.questions.map(() => null));
                  setSubmitted(false);
                }}
              >
                Retake quiz
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
