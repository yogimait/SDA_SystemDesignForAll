/** Called once per provider attempt, including repair attempts. */
export type GenerationAttemptListener = (attempt: number) => void;
