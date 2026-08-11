import { Button } from '../../design-system/components';
import { Modal } from '../../design-system/components/Modal';

interface CancelExecutionConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function CancelExecutionConfirmDialog(props: CancelExecutionConfirmDialogProps) {
  return (
    <Modal open={props.open} onClose={props.onDismiss} title="¿Cancelar la ejecución?" size="sm">
      <p class="text-sm text-text-secondary">
        El motor dejará de calcular rutas. No se guardará ningún resultado parcial y podrás volver a
        ejecutar cuando quieras.
      </p>
      <p class="mt-2 text-xs text-text-muted">Atajo: tecla Esc durante la ejecución.</p>
      <div class="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={props.onDismiss}>
          Seguir ejecutando
        </Button>
        <Button
          variant="primary"
          class="border-amber-300 bg-amber-600 hover:bg-amber-700"
          onClick={props.onConfirm}
          data-testid="confirm-cancel-execution"
        >
          Sí, cancelar
        </Button>
      </div>
    </Modal>
  );
}
