import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { Dialog } from './catalyst/dialog';
import { Button } from './catalyst/button';
import {
  ClockIcon,
  CameraIcon,
  SparklesIcon,
  ViewColumnsIcon,
  ArrowDownTrayIcon,
  XMarkIcon,
} from './icons';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: (dontShowAgain: boolean) => void;
}

const STEPS = [
  { key: 'prompts',     Icon: ClockIcon,          color: 'bg-blue-100 dark:bg-blue-900/40',   iconColor: 'text-blue-600 dark:text-blue-400' },
  { key: 'autoCapture', Icon: CameraIcon,         color: 'bg-violet-100 dark:bg-violet-900/40', iconColor: 'text-violet-600 dark:text-violet-400' },
  { key: 'aiSummary',   Icon: SparklesIcon,       color: 'bg-amber-100 dark:bg-amber-900/40', iconColor: 'text-amber-600 dark:text-amber-400' },
  { key: 'sprintBoard', Icon: ViewColumnsIcon,    color: 'bg-teal-100 dark:bg-teal-900/40',   iconColor: 'text-teal-600 dark:text-teal-400' },
  { key: 'export',      Icon: ArrowDownTrayIcon,  color: 'bg-green-100 dark:bg-green-900/40', iconColor: 'text-green-600 dark:text-green-400' },
] as const;

export function OnboardingModal({ isOpen, onClose }: OnboardingModalProps) {
  const { t } = useTranslation('settings');
  const [step, setStep] = useState(0);
  const [dontShow, setDontShow] = useState(false);
  const [direction, setDirection] = useState(1);

  const isLast = step === STEPS.length - 1;

  const handleClose = () => {
    onClose(dontShow);
    // Reset step after dialog closes
    setTimeout(() => setStep(0), 300);
  };

  const goNext = () => {
    if (isLast) {
      handleClose();
    } else {
      setDirection(1);
      setStep((s) => s + 1);
    }
  };

  const goBack = () => {
    setDirection(-1);
    setStep((s) => s - 1);
  };

  const goToStep = (i: number) => {
    setDirection(i > step ? 1 : -1);
    setStep(i);
  };

  const { Icon, color, iconColor } = STEPS[step];

  return (
    <Dialog open={isOpen} onClose={handleClose} size="2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
          WorkRecall &middot; {t('onboardingModal.navigation.next') && `Step ${step + 1} of ${STEPS.length}`}
        </span>
        <button
          onClick={handleClose}
          className="rounded-lg p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
          aria-label="Close"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Animated step content */}
      <div className="mt-6 min-h-[200px] overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ x: direction * 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction * -40, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-center text-center"
          >
            <div className={`flex h-20 w-20 items-center justify-center rounded-2xl ${color}`}>
              <Icon className={`h-10 w-10 ${iconColor}`} />
            </div>
            <h2 className="mt-5 text-xl font-semibold text-zinc-950 dark:text-white">
              {t(`onboardingModal.steps.${STEPS[step].key}.title`)}
            </h2>
            <p className="mt-3 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
              {t(`onboardingModal.steps.${STEPS[step].key}.description`)}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Step dots */}
      <div className="mt-8 flex justify-center gap-2">
        {STEPS.map((_, i) => (
          <button
            key={i}
            onClick={() => goToStep(i)}
            aria-label={`Go to step ${i + 1}`}
            className={`h-2 rounded-full transition-all duration-200 ${
              i === step
                ? 'w-6 bg-zinc-900 dark:bg-white'
                : 'w-2 bg-zinc-300 dark:bg-zinc-600 hover:bg-zinc-400 dark:hover:bg-zinc-500'
            }`}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="mt-6 flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 select-none">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            className="rounded border-zinc-300 dark:border-zinc-600"
          />
          {t('onboardingModal.dontShowAgain')}
        </label>

        <div className="flex gap-3">
          {step > 0 && (
            <Button onClick={goBack} color="zinc">
              {t('onboardingModal.navigation.back')}
            </Button>
          )}
          <Button onClick={goNext} color="blue">
            {isLast
              ? t('onboardingModal.navigation.getStarted')
              : t('onboardingModal.navigation.next')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
