import { useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'motion/react';
import { Text } from '../../components/catalyst/text';

function AnimatedNumber({ value }: { value: number }) {
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: 0.8,
      ease: [0.25, 0.1, 0.25, 1],
    });
    return controls.stop;
  }, [value, motionValue]);

  useEffect(() => {
    const unsubscribe = rounded.on('change', (v) => setDisplay(v));
    return unsubscribe;
  }, [rounded]);

  return <>{display}</>;
}

interface StatCardProps {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  value: number;
  description: string;
  isLoading: boolean;
  color: 'amber' | 'blue' | 'green' | 'purple' | 'rose';
  suffix?: string;
}

const colorMap = {
  amber: {
    border: 'border-amber-500',
    iconBg: 'bg-amber-100 dark:bg-amber-900/40',
    iconText: 'text-amber-600 dark:text-amber-400',
    darkGradient: 'dark:from-amber-950/20',
  },
  blue: {
    border: 'border-blue-500',
    iconBg: 'bg-blue-100 dark:bg-blue-900/40',
    iconText: 'text-blue-600 dark:text-blue-400',
    darkGradient: 'dark:from-blue-950/20',
  },
  green: {
    border: 'border-green-500',
    iconBg: 'bg-green-100 dark:bg-green-900/40',
    iconText: 'text-green-600 dark:text-green-400',
    darkGradient: 'dark:from-green-950/20',
  },
  purple: {
    border: 'border-purple-500',
    iconBg: 'bg-purple-100 dark:bg-purple-900/40',
    iconText: 'text-purple-600 dark:text-purple-400',
    darkGradient: 'dark:from-purple-950/20',
  },
  rose: {
    border: 'border-rose-500',
    iconBg: 'bg-rose-100 dark:bg-rose-900/40',
    iconText: 'text-rose-600 dark:text-rose-400',
    darkGradient: 'dark:from-rose-950/20',
  },
};

export function StatCard({ icon: Icon, label, value, description, isLoading, color, suffix }: StatCardProps) {
  const colors = colorMap[color];
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
      className={`rounded-lg border-t-3 ${colors.border} bg-white p-6 shadow-md hover:shadow-lg transition-shadow ring-1 ring-zinc-950/5 dark:bg-gradient-to-b ${colors.darkGradient} dark:to-zinc-900 dark:ring-white/10`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors.iconBg}`}>
          <Icon className={`h-5 w-5 ${colors.iconText}`} />
        </div>
        <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          {label}
        </h3>
      </div>
      <p className="text-3xl font-semibold text-zinc-950 dark:text-white">
        {isLoading ? '...' : <><AnimatedNumber value={value} />{suffix}</>}
      </p>
      <Text className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        {description}
      </Text>
    </motion.div>
  );
}
