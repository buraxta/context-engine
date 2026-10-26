import { describe, expect, it } from 'vitest';
import * as core from '../../mobile-core/index';
import { MOBILE_CORE_VALUES } from './mobile-core-names';

describe('mobile-core yeniden dışa verimleri', () => {
  it('eski değer adlarının hepsi duruyor; yeni ad yalnız `kod`', () => {
    const names = Object.keys(core).sort();
    expect(MOBILE_CORE_VALUES.filter((name) => !names.includes(name))).toEqual([]);
    expect(names.filter((name) => !MOBILE_CORE_VALUES.includes(name))).toEqual(['kod']);
  });

  it('kod istemcisi telefondan da erişilir', () => {
    expect(typeof core.kod.createKodApi).toBe('function');
  });
});
