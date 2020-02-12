import * as API from 'MajorasMask/API/Imports';

export class Database {
    cycle_flags: Buffer = Buffer.alloc(0x0960);
    event_flags: Buffer = Buffer.alloc(0x64);
    game_flags: Buffer = Buffer.alloc(0x0d20);
    owl_flags: Buffer = Buffer.alloc(0x02);
    intro_state: number = 0;

    scene_data: any = {};

    bank: number = 0;
    quest_status: number = 0;

    health: HealthData = new HealthData();
    magic: MagicData = new MagicData();
    equips: EquipData = new EquipData();
    items: Buffer = Buffer.alloc(0x18, -1);
    masks: Buffer = Buffer.alloc(0x18, -1);

    clock: ClockData = new ClockData();
    map: MapData = new MapData();

    // Has Started Game Check
    game_active: boolean = false;

    // Config Settings
    timeless: boolean = false;
}

export class DatabaseClient extends Database {
    clock_live: ClockData = new ClockData();
    
    clock_bak: ClockData = new ClockData();
    cycle_bak: Buffer = Buffer.alloc(0x0960);
    event_bak: Buffer = Buffer.alloc(0x64);

    intro_buffer: number = 0;

    time_reset: boolean = false;
    clock_init: boolean = false;

    clock_need_update: boolean = false;
    cycle_need_update: boolean = false;
    event_need_update: boolean = false;

    bank_need_update: boolean = false;
    health_need_update: boolean = false;
    trade_need_update: boolean = false;
    bottles_need_update: boolean = false;
}

export class DatabaseServer extends Database {
    // Puppets
    playerInstances: any = {};
    players: any = {};
    player_resetting: any = {};

    // Config Settings
    hasConfig: boolean = false;
}

export class SceneData {
    flags: Buffer = Buffer.alloc(0x14);
}

export class ClockData {
    current_day: number = 0;
    elapsed: number = 0;
    speed: number = 0;
    time: number = 0;
    is_night: boolean = false;
    is_started: boolean = false;
}

export class MapData {
    visible: number = 0;
    visited: number = 0;
}

export class HealthData {
    containers: number = 0;
    double_defense: number = 0;
    pieces: number = 0;
}

export class MagicData {
    bar: number = 0;
}

export class EquipData {
    sword: API.SwordBmp = API.SwordBmp.KOKIRI;
    shield: API.ShieldBmp = API.ShieldBmp.HERO;
    bomb_bag: API.BombBagBmp = API.BombBagBmp.NONE;
    quiver: API.QuiverBmp = API.QuiverBmp.NONE;
}