import { useTranslation } from 'react-i18next';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { Button } from '../components/catalyst/button';
import { Badge } from '../components/catalyst/badge';

export function ExportView() {
  const { t } = useTranslation(['export', 'common']);

  return (
    <div className="max-w-2xl h-full">
      <div className="flex items-center gap-3">
        <Heading>{t('export:title')}</Heading>
        <Badge color="amber">{t('common:premium.badge')}</Badge>
      </div>

      <Text className="mt-2 text-zinc-600 dark:text-zinc-400">
        {t('export:subtitle')}
      </Text>

      <div className="mt-8 rounded-lg bg-amber-50 p-6 ring-1 ring-amber-200 dark:bg-amber-950/20 dark:ring-amber-900">
        <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-200">
          {t('common:premium.title')}
        </h3>
        <Text className="mt-2 text-amber-800 dark:text-amber-300">
          {t('export:premium.message')}
        </Text>
        <div className="mt-4 flex gap-3">
          <Button color="amber">{t('common:premium.upgrade')}</Button>
          <Button plain>{t('common:premium.learnMore')}</Button>
        </div>
      </div>

      <div className="mt-8 opacity-50 pointer-events-none">
        <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
          {t('export:options.title')}
        </h3>
        <div className="mt-4 space-y-3">
          <div>
            <Button disabled className="w-full sm:w-auto">{t('export:options.excel')}</Button>
          </div>
          <div>
            <Button disabled className="w-full sm:w-auto">{t('export:options.csv')}</Button>
          </div>
          <div>
            <Button disabled className="w-full sm:w-auto">{t('export:options.json')}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
