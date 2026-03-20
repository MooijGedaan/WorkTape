import { Transition } from '@headlessui/react'
import { useTranslation } from 'react-i18next'
import { XMarkIcon } from './icons'

interface ErrorNotificationProps {
  show: boolean
  message: string
  onClose: () => void
  variant?: 'error' | 'info'
}

export function ErrorNotification({ show, message, onClose, variant = 'error' }: ErrorNotificationProps) {
  const { t } = useTranslation('common')
  const isError = variant === 'error'
  return (
    <div
      aria-live="assertive"
      className="pointer-events-none fixed inset-0 flex items-end px-4 py-6 sm:items-start sm:p-6 z-50"
    >
      <div className="flex w-full flex-col items-center space-y-4 sm:items-end">
        <Transition show={show}>
          <div className="pointer-events-auto w-full max-w-sm rounded-lg bg-white shadow-lg outline-1 outline-black/5 transition data-closed:opacity-0 data-enter:transform data-enter:duration-300 data-enter:ease-out data-closed:data-enter:translate-y-2 data-leave:duration-100 data-leave:ease-in data-closed:data-enter:sm:translate-x-2 data-closed:data-enter:sm:translate-y-0 dark:bg-zinc-800 dark:-outline-offset-1 dark:outline-white/10">
            <div className="p-4">
              <div className="flex items-start">
                <div className="flex w-0 flex-1">
                  <div className={`mr-3 mt-0.5 h-5 w-5 shrink-0 ${isError ? 'text-red-500 dark:text-red-400' : 'text-blue-500 dark:text-blue-400'}`}>
                    {isError ? (
                      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <p className="w-0 flex-1 text-sm font-medium text-zinc-900 dark:text-white">
                    {message}
                  </p>
                </div>
                <div className="ml-4 flex shrink-0">
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex rounded-md text-zinc-400 hover:text-zinc-500 focus:outline-2 focus:outline-offset-2 focus:outline-blue-600 dark:hover:text-white dark:focus:outline-blue-500"
                  >
                    <span className="sr-only">{t('actions.close')}</span>
                    <XMarkIcon aria-hidden="true" className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  )
}
