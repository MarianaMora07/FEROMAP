import { type JSX, Show, For, createSignal } from 'solid-js';

type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const variantStyles: Record<ToastVariant, { bg: string; border: string; icon: string }> = {
  success: {
    bg: 'bg-fero-green/10',
    border: 'border-fero-green/30',
    icon: '✓',
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: '✕',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: '⚠',
  },
  info: {
    bg: 'bg-fero-blue/10',
    border: 'border-fero-blue/20',
    icon: 'ℹ',
  },
};

export function ToastContainer(props: ToastProps) {
  return (
    <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      <For each={props.toasts}>
        {(toast) => {
          const style = variantStyles[toast.variant];
          return (
            <div
              class={`flex items-center gap-3 px-4 py-3 rounded-[var(--radius-lg)] border shadow-lg animate-slide-in ${style.bg} ${style.border}`}
            >
              <span class="text-lg">{style.icon}</span>
              <p class="text-sm font-medium text-text-primary flex-1">{toast.message}</p>
              <button
                type="button"
                onClick={() => props.onDismiss(toast.id)}
                class="text-text-muted hover:text-text-primary text-lg leading-none"
              >
                ×
              </button>
            </div>
          );
        }}
      </For>
    </div>
  );
}

// Toast hook
export function createToastStore() {
  const [toasts, setToasts] = createSignal<ToastItem[]>([]);

  const addToast = (message: string, variant: ToastVariant = 'info') => {
    const id = `toast-${Date.now()}`;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => removeToast(id), 5000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return { toasts, addToast, removeToast };
}
