import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../stores/toastStore', () => ({
  globalToast: { addToast: vi.fn() },
}));
vi.mock('../api/client', () => ({
  resolveUrl: (path: string) => path,
}));

import { globalToast } from '../stores/toastStore';
import {
  reportApiFailure,
  reportFrontendError,
  resetReportedErrors,
} from './errorReporter';

describe('errorReporter', () => {
  beforeEach(() => {
    resetReportedErrors();
    vi.mocked(globalToast.addToast).mockClear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no reporta errores 4xx (los maneja la vista)', () => {
    reportApiFailure(400, 'validación');

    expect(globalToast.addToast).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reporta errores 5xx al backend y avisa al usuario', () => {
    reportApiFailure(500, 'boom');

    expect(globalToast.addToast).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toContain('/api/v1/telemetry/frontend-error');
  });

  it('deduplica por mensaje y limita los toasts', () => {
    reportFrontendError(new Error('repetido'), { kind: 'x' });
    reportFrontendError(new Error('repetido'), { kind: 'x' });
    reportFrontendError(new Error('repetido'), { kind: 'x' });

    expect(globalToast.addToast).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
