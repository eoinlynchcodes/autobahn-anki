// SM-2 Spaced Repetition Algorithm
// Based on the SuperMemo SM-2 algorithm

export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;
// 0 - Complete blackout
// 1 - Incorrect, but remembered upon seeing answer
// 2 - Incorrect, but answer seemed easy to recall
// 3 - Correct with serious difficulty
// 4 - Correct with some hesitation
// 5 - Perfect response

export interface CardSchedule {
  easeFactor: number;
  interval: number; // days
  repetitions: number;
  nextReview: Date;
}

export function calculateNextReview(
  quality: ReviewQuality,
  currentEaseFactor: number,
  currentInterval: number,
  currentRepetitions: number
): CardSchedule {
  let easeFactor = currentEaseFactor;
  let interval: number;
  let repetitions: number;

  if (quality < 3) {
    // Failed - reset
    repetitions = 0;
    interval = 0;
  } else {
    // Passed
    repetitions = currentRepetitions + 1;

    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 6;
    } else {
      interval = Math.round(currentInterval * easeFactor);
    }
  }

  // Update ease factor
  easeFactor =
    easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

  // Ease factor minimum is 1.3
  if (easeFactor < 1.3) {
    easeFactor = 1.3;
  }

  const nextReview = new Date();
  if (interval === 0) {
    // Review again in 10 minutes (show again this session)
    nextReview.setMinutes(nextReview.getMinutes() + 10);
  } else {
    nextReview.setDate(nextReview.getDate() + interval);
  }

  return {
    easeFactor,
    interval,
    repetitions,
    nextReview,
  };
}

// Map simple button presses to SM-2 quality scores
export function qualityFromButton(
  button: "again" | "hard" | "good" | "easy"
): ReviewQuality {
  switch (button) {
    case "again":
      return 1;
    case "hard":
      return 3;
    case "good":
      return 4;
    case "easy":
      return 5;
  }
}
