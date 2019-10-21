export class Database {
    game_flags: Buffer = Buffer.alloc(0x0d20);
    cycle_flags: Buffer = Buffer.alloc(0x0960);

    items: Buffer = Buffer.alloc(0x18, -1);
    masks: Buffer = Buffer.alloc(0x18, -1);
}

export class DatabaseClient extends Database {

}

export class DatabaseServer extends Database {

}