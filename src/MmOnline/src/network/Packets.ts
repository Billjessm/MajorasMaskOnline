import { Packet, UDPPacket } from 'modloader64_api/ModLoaderDefaultImpls';

export class SyncStorage extends Packet {
  game_flags: Buffer;
  cycle_flags: Buffer;
  items: Buffer;
  masks: Buffer;

  constructor(
    lobby: string,
    game_flags: Buffer,
    cycle_flags: Buffer,
    inventory: Buffer,
    masks: Buffer
  ) {
    super('SyncStorage', 'MmOnline', lobby, false);
    this.game_flags = game_flags;
    this.cycle_flags = cycle_flags;
    this.items = inventory;
    this.masks = masks;
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