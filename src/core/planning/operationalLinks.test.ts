import { describe, expect, it } from 'vitest';
import { operationalMapHref } from './operationalLinks';

describe('operationalLinks', () => {
  it('builds map link with routes focus', () => {
    expect(operationalMapHref({ focus: 'routes' })).toBe('/map?focus=routes');
  });
});
