export class Database {
    items: Buffer = Buffer.alloc(0x18, -1);
    masks: Buffer = Buffer.alloc(0x18, -1);
}

export class DatabaseClient extends Database {

}

export class DatabaseServer extends Database {

}