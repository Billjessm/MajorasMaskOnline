import { Packet, UDPPacket } from 'modloader64_api/ModLoaderDefaultImpls';
import * as DB from './Database';
import { PuppetData } from '../puppets/PuppetData'
import { INetworkPlayer } from 'modloader64_api/NetworkHandler';
export class SyncStorage extends Packet {
    cycle_flags: Buffer;
    event_flags: Buffer;
    game_flags: Buffer;
    owl_flags: Buffer;
    intro_state: number;
    scene_data: any;
    bank: number;
    quest_status: number;
    health: DB.HealthData;
    magic: DB.MagicData;
    equips: DB.EquipData;
    items: Buffer;
    masks: Buffer;
    clock: DB.ClockData;
    map: DB.MapData;
    game_active: boolean;

    constructor(
        lobby: string,
        cycle_flags: Buffer,
        event_flags: Buffer,
        game_flags: Buffer,
        owl_flags: Buffer,
        intro_state: number,
        scene_data: any,
        bank: number,
        quest_status: number,
        health: DB.HealthData,
        magic: DB.MagicData,
        equips: DB.EquipData,
        items: Buffer,
        masks: Buffer,
        clock: DB.ClockData,
        map: DB.MapData,
        game_active: boolean
    ) {
        super('SyncStorage', 'MmOnline', lobby, false);
        this.cycle_flags = cycle_flags;
        this.event_flags = event_flags;
        this.game_flags = game_flags;
        this.owl_flags = owl_flags;
        this.intro_state = intro_state;
        this.scene_data = scene_data;
        this.bank = bank;
        this.quest_status = quest_status;
        this.health = health;
        this.magic = magic;
        this.equips = equips;
        this.items = items;
        this.masks = masks;
        this.clock = clock;
        this.map = map;
        this.game_active = game_active;
    }
}

export class SyncConfig extends Packet {
    timeless: boolean;

    constructor(
        lobby: string,
        timeless: boolean,
        persist: boolean
    ) {
        super('SyncConfig', 'MmOnline', lobby, persist);
        this.timeless = timeless;
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

export class SyncPlayerData extends Packet {
    scene: number;
    player: INetworkPlayer;
    form: number;
    constructor(lobby: string, scene: number, player: INetworkPlayer, form: number, persist: boolean) {
        super('SyncPlayerData', 'MmOnline', lobby, persist);
        this.scene = scene;
        this.player = player;
        this.form = form;
    }
}

export class SyncClock extends Packet {
    clock: DB.ClockData;
    constructor(lobby: string, clock: DB.ClockData) {
        super('SyncClock', 'MmOnline', lobby, true);
        this.clock = clock;
    }
}

export class SyncMap extends Packet {
    visible: number;
    visited: number;
    constructor(lobby: string, visible: number, visited: number, persist: boolean) {
        super('SyncMap', 'MmOnline', lobby, persist);
        this.visible = visible;
        this.visited = visited;
    }
}

export class SyncHealth extends Packet {
    containers: number;
    double_defense: number;
    pieces: number;
    constructor(
        lobby: string,
        containers: number,
        double_defense: number,
        pieces: number,
        persist: boolean
    ) {
        super('SyncHealth', "MmOnline", lobby, persist);
        this.containers = containers;
        this.double_defense = double_defense;
        this.pieces = pieces;
    }
}

export class SyncMagic extends Packet {
    bar: number;
    constructor(lobby: string, bar: number, persist: boolean) {
        super('SyncMagic', "MmOnline", lobby, persist);
        this.bar = bar;
    }
}

export class SyncEquipSlots extends Packet {
    equips: DB.EquipData;
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
    cycle: Buffer;
    events: Buffer;
    clock: DB.ClockData;
    constructor(
        lobby: string,
        cycle: Buffer,
        events: Buffer,
        clock: DB.ClockData,
        persist: boolean
    ) {
        super('SyncTimeReset', 'MmOnline', lobby, true);
        this.cycle = cycle;
        this.events = events;
        this.clock = clock;
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

export class MmO_PuppetPacket extends UDPPacket {
    data: PuppetData;
  
    constructor(puppetData: PuppetData, lobby: string) {
      super('MmO_PuppetPacket', 'MmOnline', lobby, false);
      this.data = puppetData;
    }
  }
export class SyncLocation extends Packet {
    scene: number;
    constructor(lobby: string, scene: number) {
        super('SyncLocation', 'MmOnline', lobby, true);
        this.scene = scene;
    }
}
