import { Packet, UDPPacket } from 'modloader64_api/ModLoaderDefaultImpls';
import * as DB from './Database';

export class SyncStorage extends Packet {
    cycle_flags: Buffer;
    event_flags: Buffer;
    game_flags: Buffer;
    owl_flags: Buffer;
    scene_data: any;
    bank: number;
    quest_status: number;
    equips: DB.EquipData;
    items: Buffer;
    masks: Buffer;
    clock: DB.ClockData;
    game_active: boolean;

    constructor(
        lobby: string,
        cycle_flags: Buffer,
        event_flags: Buffer,
        game_flags: Buffer,
        owl_flags: Buffer,
        scene_data: any,
        bank: number,
        quest_status: number,
        equips: DB.EquipData,
        items: Buffer,
        masks: Buffer,
        clock: DB.ClockData,
        game_active: boolean
    ) {
        super('SyncStorage', 'MmOnline', lobby, false);
        this.cycle_flags = cycle_flags;
        this.event_flags = event_flags;
        this.game_flags = game_flags;
        this.owl_flags = owl_flags;
        this.scene_data = scene_data;
        this.bank = bank;
        this.quest_status = quest_status;
        this.equips = equips;
        this.items = items;
        this.masks = masks;
        this.clock = clock;
        this.game_active = game_active;
    }
}

export class SyncBuffered extends Packet {
    value: Buffer;
    constructor(lobby: string, header: string, value: Buffer, persist: boolean) {
        super(header, 'MmOnline', lobby, persist);
        this.value = value;
    }
}

export class SyncNumbered extends Packet {
    value: number;
    constructor(lobby: string, header: string, value: number, persist: boolean) {
        super(header, 'MmOnline', lobby, persist);
        this.value = value;
    }
}

export class SyncSceneData extends Packet {
    scene: number;
    flags: Buffer;
    constructor(lobby: string, scene: number, flags: Buffer, persist: boolean) {
        super('SyncSceneData', 'MmOnline', lobby, persist);
        this.scene = scene;
        this.flags = flags;
    }
}

export class SyncClock extends Packet {
    clock: DB.ClockData;
    constructor(lobby: string, clock: DB.ClockData) {
        super('SyncClock', 'MmOnline', lobby, true);
        this.clock = clock;
    }
}

export class SyncEquipSlots extends Packet {
    equips: DB.EquipData
    constructor(
        lobby: string, 
        equips: DB.EquipData,
        persist: boolean
    ) {
        super('SyncEquipSlots', 'MmOnline', lobby, persist);
        this.equips = equips;
    }
}

export class SyncTimeReset extends Packet {
    cycle_flags: Buffer;
    event_flags: Buffer;
    items: Buffer;
    masks: Buffer;
    constructor(
        lobby: string,
        cycle_flags: Buffer,
        event_flags: Buffer,
        items: Buffer,
        masks: Buffer,
        persist: boolean
    ) {
        super('SyncTimeReset', 'MmOnline', lobby, true);
        this.cycle_flags = cycle_flags;
        this.event_flags = event_flags;
        this.items = items;
        this.masks = masks;
    }
}

// #################################################
// ##  Puppet Tracking
// #################################################

// export class SyncPuppet extends UDPPacket {
//   puppet: PData.IData;
//   constructor(lobby: string, value: PData.Data) {
//       super('SyncPuppet', 'BkOnline', lobby, false);
//       this.puppet = value;
//   }
// }

export class SyncLocation extends Packet {
    scene: number;
    constructor(lobby: string, scene: number) {
        super('SyncLocation', 'MmOnline', lobby, true);
        this.scene = scene;
    }
}
