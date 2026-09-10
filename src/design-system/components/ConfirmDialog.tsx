import { Show } from 'solid-js';
import { Button } from './Button';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** Texto secundario opcional (consecuencias, atajos, etc.). */
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` para acciones destructivas; `primary` para el resto. */
  tone?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testId?: string;
}

/** Diálogo de confirmación del sistema (Modal + Button), para reemplazar `window.confirm`. */
export function ConfirmDialog(props: ConfirmDialogProps) {
  return (
    <Modal open={props.open} onClose={props.onCancel} title={props.title} size="sm">
      <p class="text-sm text-text-secondary">{props.message}</p>
      <Show when={props.detail}>
        <p class="mt-2 text-xs text-text-muted">{props.detail}</p>
      </Show>
      <div class="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={props.onCancel} disabled={props.loading}>
          {props.cancelLabel ?? 'Cancelar'}
        </Button>
        <Button
          variant={props.tone === 'danger' ? 'danger' : 'primary'}
          loading={props.loading}
          onClick={props.onConfirm}
          data-testid={props.testId ?? 'confirm-dialog-confirm'}
        >
          {props.confirmLabel ?? 'Confirmar'}
        </Button>
      </div>
    </Modal>
  );
}
