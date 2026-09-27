import { Show, createSignal } from 'solid-js';
import { Button, Modal, TextField } from '../../design-system/components';
import type { CaseStudyCreatePayload } from '../../core/api/caseStudies';
import { normalizeCaseStudyCode } from '../../data/types/caseStudy';

interface CaseStudyCreateModalProps {
  open: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: CaseStudyCreatePayload) => Promise<void>;
}

export function CaseStudyCreateModal(props: CaseStudyCreateModalProps) {
  const [code, setCode] = createSignal('');
  const [name, setName] = createSignal('');
  const [description, setDescription] = createSignal('');
  const [error, setError] = createSignal('');

  const reset = () => {
    setCode('');
    setName('');
    setDescription('');
    setError('');
  };

  const handleClose = () => {
    reset();
    props.onClose();
  };

  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    setError('');
    try {
      const normalizedCode = normalizeCaseStudyCode(code());
      if (!name().trim()) {
        setError('El nombre es obligatorio.');
        return;
      }
      await props.onSubmit({
        code: normalizedCode,
        name: name().trim(),
        description: description().trim() || null,
        status: 'draft',
      });
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el caso');
    }
  };

  return (
    <Modal open={props.open} onClose={handleClose} title="Nuevo caso de estudio">
      <form class="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <TextField
          label="Código"
          value={code()}
          onInput={setCode}
          placeholder="CE-MI-CASO-1"
          required
        />
        <TextField
          label="Nombre"
          value={name()}
          onInput={setName}
          placeholder="Caso de estudio 1"
          required
        />
        <TextField
          label="Descripción"
          value={description()}
          onInput={setDescription}
          placeholder="Opcional — propósito del escenario académico"
        />
        <Show when={error()}>
          <p class="text-sm text-red-600 dark:text-red-300">{error()}</p>
        </Show>
        <div class="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={handleClose} disabled={props.submitting}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={props.submitting}>
            {props.submitting ? 'Creando…' : 'Crear caso'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
