import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import {
  CursorArrowRaysIcon,
  LinkIcon,
  SparklesIcon,
  Squares2X2Icon,
  CalendarDaysIcon,
  ChartBarIcon,
  CameraIcon,
} from '@heroicons/react/20/solid';

export interface TooltipHintProps {
  show: boolean;
  title: string;
  body: string;
  icon?: 'cursor' | 'link' | 'sparkles' | 'drag' | 'calendar' | 'chart' | 'camera';
  accentColor?: string;
  onDismiss: () => void;
  onDisableAll: () => void;
  position?: 'bottom-right' | 'bottom-left';
}

function HintIcon({ icon, className }: { icon: TooltipHintProps['icon']; className?: string }) {
  switch (icon) {
    case 'link':
      return <LinkIcon className={className} />;
    case 'sparkles':
      return <SparklesIcon className={className} />;
    case 'drag':
      return <Squares2X2Icon className={className} />;
    case 'calendar':
      return <CalendarDaysIcon className={className} />;
    case 'chart':
      return <ChartBarIcon className={className} />;
    case 'camera':
      return <CameraIcon className={className} />;
    case 'cursor':
    default:
      return <CursorArrowRaysIcon className={className} />;
  }
}

export function TooltipHint({
  show,
  title,
  body,
  icon,
  accentColor = 'text-blue-500 dark:text-blue-400',
  onDismiss,
  onDisableAll,
  position = 'bottom-right',
}: TooltipHintProps) {
  const { t } = useTranslation('common');

  const positionClass =
    position === 'bottom-left'
      ? 'fixed bottom-6 left-6'
      : 'fixed bottom-6 right-6';

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className={`${positionClass} z-40 w-72`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
        >
          <div className="rounded-xl bg-white p-4 shadow-lg outline outline-1 outline-black/5 dark:bg-zinc-800 dark:outline-white/10">
            <div className="flex items-start gap-3">
              <HintIcon
                icon={icon}
                className={`h-5 w-5 mt-0.5 flex-shrink-0 ${accentColor}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{title}</p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{body}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={onDismiss}
                className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
              >
                {t('tooltipHints.gotIt')}
              </button>
              <button
                type="button"
                onClick={onDisableAll}
                className="text-xs text-zinc-400 hover:text-zinc-500 dark:text-zinc-500 dark:hover:text-zinc-400"
              >
                {t('tooltipHints.disableAll')}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
