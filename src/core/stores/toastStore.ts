import { createRoot } from 'solid-js';
import { createToastStore } from '../../design-system/components/Toast';

export const globalToast = createRoot(createToastStore);
