export class Database {
    cycle_flags: Buffer = Buffer.alloc(0x0960);
    event_flags: Buffer = Buffer.alloc(0x64);
    game_flags: Buffer = Buffer.alloc(0x0d20);
    owl_flags: Buffer = Buffer.alloc(0x02);

    scene_data: any = {};

    items: Buffer = Buffer.alloc(0x18, -1);
    masks: Buffer = Buffer.alloc(0x18, -1);
    
    clock: ClockData = new ClockData();

    // Has Started Game Check
    game_active: boolean = false;
}

export class DatabaseClient extends Database {
    cycle_reset: number = 0;
    clock_init: boolean = false;
    clock_need_update: boolean = false;
    cycle_need_update: boolean = false;
    event_need_update: boolean = false;
}

export class DatabaseServer extends Database {
    // Puppets
    playerInstances: any = {};
    players: any = {};
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
    is_started:boolean = false;
}