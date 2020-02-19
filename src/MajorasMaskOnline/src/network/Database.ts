import * as API from 'MajorasMask/API/Imports';

export class Database {
    cycle_flags: Buffer = Buffer.alloc(0x0960);
    event_flags: Buffer = Buffer.alloc(0x64);
    game_flags: Buffer = Buffer.alloc(0x0d20);
    owl_flags: Buffer = Buffer.alloc(0x02);

    scene_data: any = {};

    bank: number = 0;
    intro_state: number = 0;
    quest_status: number = 0;
    skill_level: number = 0;
    wallet: number = 0;

    clock: ClockData = new ClockData();
    dungeon: DungeonData = new DungeonData();
    equips: EquipData = new EquipData();
    health: HealthData = new HealthData();
    magic: MagicData = new MagicData();
    map: MapData = new MapData();
    items: Buffer = Buffer.alloc(0x18, -1);
    masks: Buffer = Buffer.alloc(0x18, -1);

    // Has Started Game Check
    has_game_data: boolean = false;
    has_game_plyr: boolean = false;

    // Prevent duplicate day increments on clock
    time_card_state: number = 0;

    // Config Settings
    timeless: boolean = false;
}

export class DatabaseClient extends Database {
    clock_live: ClockData = new ClockData();

    cycle_bak: Buffer = Buffer.alloc(0x0960);
    event_bak: Buffer = Buffer.alloc(0x64);

    intro_buffer: number = 0;
    last_form: number = 4;

    in_game: boolean = false;
    is_rando: boolean = false;
    time_reset: boolean = false;

    clock_need_update: boolean = false;
    cycle_need_update: boolean = false;
    event_need_update: boolean = false;

    bank_need_update: boolean = false;
    c_buttons_need_update: boolean = false;
    keys_need_update: boolean = false;
    health_need_update: boolean = false;
    trade_need_update: boolean = false;
    bottles_need_update: boolean = false;
}

export class DatabaseServer extends Database {
    // Puppets
    playerInstances: any = {};
    players: any = {};

    // Time manipulations
    player_resetting: any = {};

    // Config Settings
    hasConfig: boolean = false;
}

export class ClockData {
    current_day: number = 0;
    elapsed: number = 0;
    speed: number = 0;
    time: number = 0;
    is_night: boolean = false;
}

export class DungeonData {
    fairies: number = 0;
    items: number = 0;
    keys: number = 0;
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

export class MapData {
    mini: Buffer = Buffer.alloc(0x1c);
    visible: number = 0;
    visited: number = 0;
}

export class SceneData {
    flags: Buffer = Buffer.alloc(0x14);
}
