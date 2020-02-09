import IMemory from 'modloader64_api/IMemory';
import * as API from '../API/Imports';
import * as SUB from './Sub/Imports';


export class MmHelper extends API.BaseObj implements API.IMmHelper {
    entering_zone(): boolean {
    let r = API.LinkState.LOADING_ZONE;
    return (r & 0x000000ff) === 1;
  }
  isPaused(): boolean {
    return this.emulator.rdramRead32(0x1D1500) !== 0x3;
  }
}