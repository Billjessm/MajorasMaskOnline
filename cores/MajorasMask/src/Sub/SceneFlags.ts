import IMemory from 'modloader64_api/IMemory';
import * as API from '../../API/Imports';

export class SceneFlags extends API.BufferObj implements API.IBuffered {
    constructor(emu: IMemory) {
        super(emu, 0x3e8988, 0x14);
    }
}
