import { Transition } from '@headlessui/react'
import { XMarkIcon } from './icons'

interface UndoNotificationProps {
  show: boolean
  message: string
  onUndo: () => void
  onClose: () => void
}

export function UndoNotification({ show, message, onUndo, onClose }: UndoNotificationProps) {
  return (
    <div
      aria-live="assertive"
      className="pointer-events-none fixed inset-0 flex items-end px-4 py-6 sm:items-start sm:p-6 z-50"
    >
      <div className="flex w-full flex-col items-center space-y-4 sm:items-end">
        <Transition show={show}>
          <div className="pointer-events-auto w-full max-w-sm rounded-lg bg-white shadow-lg outline-1 outline-black/5 transition data-closed:opacity-0 data-enter:transform data-enter:duration-300 data-enter:ease-out data-closed:data-enter:translate-y-2 data-leave:duration-100 data-leave:ease-in data-closed:data-enter:sm:translate-x-2 data-closed:data-enter:sm:translate-y-0 dark:bg-zinc-800 dark:-outline-offset-1 dark:outline-white/10">
            <div className="p-4">
              <div className="flex items-center">
                <div className="flex w-0 flex-1 justify-between">
                  <p className="w-0 flex-1 text-sm font-medium text-zinc-900 dark:text-white">
                    {message}
                  </p>
                  <button
                    type="button"
                    onClick={onUndo}
                    className="ml-3 shrink-0 rounded-md bg-white text-sm font-medium text-blue-600 hover:text-blue-500 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500 dark:bg-zinc-800 dark:text-blue-400 dark:hover:text-blue-300 dark:focus:outline-blue-400"
                  >
                    Undo
                  </button>
                </div>
                <div className="ml-4 flex shrink-0">
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex rounded-md text-zinc-400 hover:text-zinc-500 focus:outline-2 focus:outline-offset-2 focus:outline-blue-600 dark:hover:text-white dark:focus:outline-blue-500"
                  >
                    <span className="sr-only">Close</span>
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
