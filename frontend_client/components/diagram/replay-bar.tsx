"use client";

/**
 * Replay controls + pinned caption for the HLD flow path replay. HTML
 * overlay under the canvas (never floats over nodes); all controls are real
 * buttons (keyboard operable); the caption is aria-live="polite".
 */

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReplayBar({
  caption,
  index,
  total,
  playing,
  speed,
  onTogglePlay,
  onPrev,
  onNext,
  onReset,
  onSpeed,
  onClose,
}: {
  caption: string;
  index: number;
  total: number;
  playing: boolean;
  speed: number;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
  onSpeed: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="bg-card/95 border-border absolute bottom-3 left-1/2 z-10 w-[min(94%,620px)] -translate-x-1/2 rounded-xl border border-solid p-3 shadow-lg backdrop-blur"
      role="group"
      aria-label="Flow replay"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground font-mono text-[10px] uppercase">
            {`replay · step ${index + 1} / ${total} · ${speed}×`}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Stop replay" onClick={onClose}>
          <XIcon />
        </Button>
      </div>
      <p
        className="text-foreground mt-1 line-clamp-2 text-xs leading-relaxed"
        aria-live="polite"
      >
        {caption}
      </p>
      <div className="border-border mt-2 flex items-center gap-2 border-t border-solid pt-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={playing ? "Pause replay" : "Play replay"}
          onClick={onTogglePlay}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Restart from the first step"
          disabled={index === 0 && playing}
          onClick={onReset}
        >
          <RotateCcwIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Previous step"
          disabled={index === 0}
          onClick={onPrev}
        >
          <ChevronLeftIcon />
        </Button>
        <div
          aria-hidden="true"
          className="bg-muted h-1 min-w-0 flex-1 overflow-hidden rounded-full"
        >
          <div
            className="bg-primary h-1 rounded-full transition-[width] duration-200"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Next step"
          disabled={index >= total - 1}
          onClick={onNext}
        >
          <ChevronRightIcon />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="font-mono text-[11px]"
          aria-label={speed === 1 ? "Replay speed 2×" : "Replay speed 1×"}
          onClick={onSpeed}
        >
          {`${speed}×`}
        </Button>
      </div>
    </div>
  );
}
