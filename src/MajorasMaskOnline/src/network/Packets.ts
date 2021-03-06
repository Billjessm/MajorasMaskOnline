import { INetworkPlayer } from 'modloader64_api/NetworkHandler';
import { Packet, UDPPacket } from 'modloader64_api/ModLoaderDefaultImpls';
import * as DB from './Database';
import * as PData from '../puppets/Instance'

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
    dungeon: DB.DungeonData;
    map: DB.MapData;
    skill_level: number;
    wallet: number;
    has_game_data: boolean;
    has_game_plyr: boolean;

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
        dungeon: DB.DungeonData,
        map: DB.MapData,
        skill_level: number,
        wallet: number,
        has_game_data: boolean,
        has_game_plyr: boolean
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
        this.dungeon = dungeon;
        this.map = map;
        this.skill_level = skill_level;
        this.wallet = wallet;
        this.has_game_data = has_game_data;
        this.has_game_plyr = has_game_plyr;
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

export class SyncClock extends Packet {
    clock: DB.ClockData;
    constructor(lobby: string, clock: DB.ClockData, persist: boolean) {
        super('SyncClock', 'MmOnline', lobby, persist);
        this.clock = clock;
    }
}

export class SyncDungeon extends Packet {
    fairies: number;
    items: number;
    keys: number;
    constructor(
        lobby: string,
        fairies: number,
        items: number,
        keys: number,
        persist: boolean
    ) {
        super('SyncDungeon', 'MmOnline', lobby, persist);
        this.fairies = fairies;
        this.items = items;
        this.keys = keys;
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

export class SyncMap extends Packet {
    map: DB.MapData;
    constructor(lobby: string, map: DB.MapData, persist: boolean) {
        super('SyncMap', 'MmOnline', lobby, persist);
        this.map = map;
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

export class SyncTimeReset extends Packet {
    cycle: Buffer;
    events: Buffer;
    constructor(
        lobby: string,
        cycle: Buffer,
        events: Buffer,
        persist: boolean
    ) {
        super('SyncTimeReset', 'MmOnline', lobby, true);
        this.cycle = cycle;
        this.events = events;
    }
}


// #################################################
// ##  Puppet Tracking
// #################################################

export class SyncPuppet extends UDPPacket {
    puppet: PData.Data;
    constructor(lobby: string, puppet: PData.Data) {
        super('SyncPuppet', 'MmOnline', lobby, false);
        this.puppet = puppet;
    }
}

export class SyncLocation extends Packet {
    player: INetworkPlayer;
    scene: number;
    form: number;
    constructor(
        lobby: string,
        player: INetworkPlayer,
        scene: number,
        form: number
    ) {
        super('SyncLocation', 'MmOnline', lobby, true);
        this.player = player;
        this.scene = scene;
        this.form = form;
    }
}
