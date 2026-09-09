'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ArrowLeft, ArrowRight, CircleHelp, RotateCcw, X } from 'lucide-react';
import {
  markCompleted,
  markSkipped,
  requiresOnboarding,
  type OnboardingState,
} from '../../lib/onboarding-core';
import { loadOnboardingState, saveOnboardingState } from '../../lib/onboarding-storage';
import {
  visibleTourSteps,
  type TourSection,
  type TourStep,
} from '../../lib/onboarding-steps';

type Phase = 'loading' | 'idle' | 'welcome' | 'tour' | 'skip-confirm';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const REPLAY_EVENT = 'fullaludoor:replay-tour';

function measureRect(el: Element): Rect {
  const rect = el.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

export interface OnboardingProviderProps {
  children: ReactNode;
  hasProject: boolean;
  onActivateSection: (section: TourSection, tool?: TourStep['tool']) => void;
  onFinish: () => void;
  onStartNewProject: () => void;
}

export default function OnboardingProvider({
  children,
  hasProject,
  onActivateSection,
  onFinish,
  onStartNewProject,
}: OnboardingProviderProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [state, setState] = useState<OnboardingState | null>(null);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const measureTimerRef = useRef<number | null>(null);

  const persist = useCallback(async (next: OnboardingState) => {
    setState(next);
    await saveOnboardingState(next);
  }, []);

  // Boot: load persisted state, then decide whether to show the welcome screen.
  useEffect(() => {
    let cancelled = false;
    void loadOnboardingState().then((loaded) => {
      if (cancelled) return;
      setState(loaded);
      setPhase(requiresOnboarding(loaded) ? 'welcome' : 'idle');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const beginTour = useCallback(() => {
    setSteps(visibleTourSteps({ hasProject }));
    setStepIndex(0);
    setRect(null);
    setPhase('tour');
  }, [hasProject]);

  // Replay support (triggered from the help control).
  useEffect(() => {
    const handler = () => {
      if (phase === 'idle' || phase === 'loading') beginTour();
    };
    window.addEventListener(REPLAY_EVENT, handler);
    return () => window.removeEventListener(REPLAY_EVENT, handler);
  }, [phase, beginTour]);

  const current = stepIndex < steps.length ? steps[stepIndex] : null;

  const finishAs = useCallback(
    async (kind: 'completed' | 'skipped') => {
      if (!state) return;
      const next = kind === 'completed' ? markCompleted(state) : markSkipped(state);
      await persist(next);
      setPhase('idle');
      setSteps([]);
      setStepIndex(0);
      setRect(null);
      onFinish();
    },
    [state, persist, onFinish]
  );

  const measureStepTarget = useCallback(() => {
    const step = stepIndex < steps.length ? steps[stepIndex] : null;
    if (!step || step.final || !step.target) {
      setRect(null);
      return false;
    }
    const el = document.querySelector(step.target);
    if (!el) return false;
    setRect(measureRect(el));
    return true;
  }, [steps, stepIndex]);

  // When the step changes: activate the section, wait for the UI to settle, then
  // measure the spotlight target. A missing target simply skips that step.
  useEffect(() => {
    if (phase !== 'tour' || !current) return;
    if (current.final) {
      onActivateSection(current.section, current.tool);
      setRect(null);
      return;
    }
    onActivateSection(current.section, current.tool);

    let cancelled = false;
    const attempt = (attemptsLeft: number) => {
      if (cancelled) return;
      if (attemptsLeft <= 0) {
        setStepIndex((index) => index + 1); // missing target — skip gracefully
        return;
      }
      if (measureStepTarget()) return;
      window.setTimeout(() => attempt(attemptsLeft - 1), 90);
    };
    const raf = window.requestAnimationFrame(() => attempt(6));
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, stepIndex]);

  // Keep the spotlight on the target if the page scrolls / resizes mid-step.
  useEffect(() => {
    if (phase !== 'tour') return;
    const recompute = () => {
      if (measureTimerRef.current) window.clearTimeout(measureTimerRef.current);
      measureTimerRef.current = window.setTimeout(() => {
        const step = stepIndex < steps.length ? steps[stepIndex] : null;
        if (!step || step.final) return;
        const el = step.target ? document.querySelector(step.target) : null;
        if (el) setRect(measureRect(el));
      }, 40);
    };
    window.addEventListener('scroll', recompute, true);
    window.addEventListener('resize', recompute);
    return () => {
      window.removeEventListener('scroll', recompute, true);
      window.removeEventListener('resize', recompute);
      if (measureTimerRef.current) window.clearTimeout(measureTimerRef.current);
    };
  }, [phase, stepIndex, steps]);

  // Keyboard: Escape skips (or cancels the skip confirmation).
  useEffect(() => {
    if (phase !== 'tour' && phase !== 'welcome' && phase !== 'skip-confirm') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (phase === 'skip-confirm') {
        setPhase('tour');
      } else if (phase === 'tour') {
        setPhase('skip-confirm');
      } else if (phase === 'welcome') {
        void finishAs('skipped');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, finishAs]);

  if (phase === 'loading') return <>{children}</>;

  const total = steps.length;
  const finalStep = current?.final === true;

  const placed =
    finalStep || !rect
      ? null
      : rect.top > 360
        ? { bottom: window.innerHeight - rect.top + 12 }
        : { top: rect.top + rect.height + 12 };

  return (
    <>
      {children}

      {phase === 'welcome' && (
        <div className="ob-scrim" role="dialog" aria-modal="true" aria-label="Welcome to FullAluDoor">
          <div className="ob-welcome" ref={overlayRef}>
            <span className="ob-welcome-mark" aria-hidden="true">
              <CircleHelp size={26} />
            </span>
            <p className="ob-eyebrow">FULLALUDOOR</p>
            <h1>Welcome to FullAluDoor</h1>
            <p className="ob-lead">
              Let&apos;s take a quick tour of your aluminium design and fabrication workspace.
            </p>
            <div className="ob-actions">
              <button type="button" className="btn btn-primary" autoFocus onClick={beginTour}>
                Start Tour
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  void finishAs('skipped');
                }}
              >
                Skip for now
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'tour' && current && (
        <div
          className="ob-tour-layer"
          ref={overlayRef}
          aria-label="Guided tour"
          style={{ zIndex: 1200 }}
        >
          {!finalStep && rect && (
            <>
              <div
                className="ob-dim ob-dim-top"
                style={{ height: Math.max(0, rect.top - 6), zIndex: 1 }}
              />
              <div
                className="ob-dim ob-dim-bottom"
                style={{ top: rect.top + rect.height + 6, height: 'auto', zIndex: 1 }}
              />
              <div
                className="ob-dim ob-dim-left"
                style={{ top: Math.max(0, rect.top - 6), height: rect.height + 12, width: Math.max(0, rect.left - 6), zIndex: 1 }}
              />
              <div
                className="ob-dim ob-dim-right"
                style={{ top: Math.max(0, rect.top - 6), height: rect.height + 12, left: rect.left + rect.width + 6, width: 'auto', zIndex: 1 }}
              />
              <div
                className="ob-spotlight"
                style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
              />
            </>
          )}

          {finalStep && <div className="ob-dim ob-dim-top" style={{ height: '100vh', zIndex: 1 }} />}

          <div
            className={`ob-card ${finalStep ? 'ob-card-center' : ''}`}
            style={placed ?? undefined}
            role="region"
            aria-live="polite"
          >
            <div className="ob-card-head">
              <span className="ob-step-count">
                Step {stepIndex + 1} of {total}
              </span>
              {!finalStep && (
                <button
                  type="button"
                  className="ob-icon-btn"
                  aria-label="Skip tour"
                  title="Skip tour"
                  onClick={() => setPhase('skip-confirm')}
                >
                  <X size={15} />
                </button>
              )}
            </div>

            <h2 className="ob-card-title">{current.title}</h2>
            {current.paragraphs.map((paragraph) => (
              <p key={paragraph} className="ob-card-text">
                {paragraph}
              </p>
            ))}
            {current.bullets && current.bullets.length > 0 && (
              <ul className="ob-card-list">
                {current.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            )}

            <div className="ob-progress" aria-hidden="true">
              {Array.from({ length: total }).map((_, dot) => (
                <span key={dot} className={dot === stepIndex ? 'ob-progress-dot active' : 'ob-progress-dot'} />
              ))}
            </div>

            <div className="ob-card-actions">
              <button
                type="button"
                className="btn btn-ghost ob-back"
                onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
                disabled={stepIndex === 0}
              >
                <ArrowLeft size={14} /> Back
              </button>
              <button
                type="button"
                className="btn ob-skip"
                onClick={() => setPhase('skip-confirm')}
              >
                Skip Tour
              </button>
              {finalStep ? (
                <button
                  type="button"
                  className="btn btn-primary ob-next"
                  autoFocus
                  onClick={() => {
                    onStartNewProject();
                    void finishAs('completed');
                  }}
                >
                  Start My First Project
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary ob-next"
                  autoFocus
                  onClick={() => setStepIndex((index) => Math.min(total - 1, index + 1))}
                >
                  Next <ArrowRight size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {phase === 'skip-confirm' && (
        <div className="ob-scrim" role="dialog" aria-modal="true" aria-label="Skip the guided tour?">
          <div className="ob-confirm">
            <h2>Skip the guided tour?</h2>
            <p>You can replay the full tour any time from the help button in the top bar.</p>
            <div className="ob-actions">
              <button type="button" className="btn" autoFocus onClick={() => setPhase('tour')}>
                Continue Tour
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  void finishAs('skipped');
                }}
              >
                Skip Tour
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Dispatch a replay request from anywhere (used by the help control). */
export function requestTourReplay(): void {
  window.dispatchEvent(new Event(REPLAY_EVENT));
}

export function TourReplayButton() {
  return (
    <button
      type="button"
      className="btn-icon"
      title="Take the guided tour"
      aria-label="Replay the guided tour"
      onClick={requestTourReplay}
    >
      <RotateCcw size={15} />
    </button>
  );
}
